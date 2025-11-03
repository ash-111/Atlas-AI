import json
import uuid
import datetime
from botocore.auth import SigV4Auth
from botocore.awsrequest import AWSRequest
from botocore.session import get_session
import urllib3
import boto3

# --- Configuration ---
GRAPHQL_ENDPOINT = "https://myryeizelrcvxmitltzlv3fiby.appsync-api.us-east-1.amazonaws.com/graphql"
REGION = "us-east-1"
PLACE_INDEX_NAME = "AtlasPlaceIndex"

# --- AWS Clients ---
http = urllib3.PoolManager()
location_client = boto3.client('location', region_name=REGION)

def geocode_location(location_name):
    """Uses Amazon Location Service to find coordinates for a location name."""
    try:
        print(f"Geocoding location: {location_name}")
        response = location_client.search_place_index_for_text(
            IndexName=PLACE_INDEX_NAME, Text=location_name, MaxResults=1
        )
        if response['Results']:
            place = response['Results'][0]['Place']
            lon, lat = place['Geometry']['Point']
            print(f"Found coordinates: Lat={lat}, Lon={lon}")
            return {'latitude': float(lat), 'longitude': float(lon)}
        else:
            print(f"Could not find coordinates for {location_name}")
            return {'latitude': 0.0, 'longitude': 0.0}
    except Exception as e:
        print(f"[ERROR] Geocoding failed: {str(e)}")
        return {'latitude': 0.0, 'longitude': 0.0}

def lambda_handler(event, context):
    print("Incoming event:", json.dumps(event, indent=2))

    props = event.get("requestBody", {}).get("content", {}).get("application/json", {}).get("properties", [])
    payload = {p["name"]: p.get("value") for p in props}
    summary = payload.get("event_summary") or "Unspecified incident"
    location = payload.get("location") or "Unspecified location"
    
    coords = geocode_location(location)
    
    # --- THIS IS THE FIX: The full, correct mutation string ---
    mutation = """
    mutation CreateIncident(
      $incidentId: ID!,
      $location: String!,
      $latitude: Float!,
      $longitude: Float!,
      $summary: String!,
      $severity: String,
      $timestamp: AWSDateTime!
    ) {
      createIncident(
        incidentId: $incidentId,
        location: $location,
        latitude: $latitude,
        longitude: $longitude,
        summary: $summary,
        severity: $severity,
        timestamp: $timestamp
      ) {
        incidentId
        location
        latitude
        longitude
        summary
        severity
        timestamp
      }
    }
    """

    variables = {
        "incidentId": str(uuid.uuid4()),
        "location": location,
        "latitude": coords['latitude'],
        "longitude": coords['longitude'],
        "summary": summary,
        "severity": "High",
        "timestamp": datetime.datetime.utcnow().isoformat() + "Z"
    }

    body = json.dumps({"query": mutation, "variables": variables})
    request = AWSRequest(method="POST", url=GRAPHQL_ENDPOINT, data=body, headers={"Content-Type": "application/json"})
    session = get_session()
    credentials = session.get_credentials()
    SigV4Auth(credentials, "appsync", REGION).add_auth(request)

    response = http.request("POST", GRAPHQL_ENDPOINT, body=body, headers=dict(request.headers))
    result = json.loads(response.data.decode("utf-8"))
    print("AppSync response:", result)

    if 'errors' in result:
        raise Exception(f"Failed to create incident in AppSync: {result['errors']}")

    # --- Return response for Bedrock ---
    final_result_for_agent = {"message": f"Notification sent for {location}"}
    response_body = {'application/json': {'body': json.dumps(final_result_for_agent)}}
    action_response = {
        'actionGroup': event["actionGroup"], 'apiPath': event["apiPath"],
        'httpMethod': event["httpMethod"], 'httpStatusCode': 200,
        'responseBody': response_body
    }
    return {
        'response': action_response, 'messageVersion': event["messageVersion"],
        'sessionAttributes': event.get("sessionAttributes", {}),
        'promptSessionAttributes': event.get("promptSessionAttributes", {})
    }