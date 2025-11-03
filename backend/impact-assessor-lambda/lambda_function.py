import json
import os
import boto3

dynamodb = boto3.resource('dynamodb')
TABLE_NAME = os.environ.get('TABLE_NAME')
table = dynamodb.Table(TABLE_NAME)

STOP_WORDS = {'port', 'of', 'international', 'airport', 'center', 'hub', 'warehouse', 'terminal', 'de', 'es', 'el'}

def lambda_handler(event, context):
    print(f"Received FINAL agent event: {json.dumps(event)}")
    
    properties = event['requestBody']['content']['application/json']['properties']
    
    location_from_agent = None
    for prop in properties:
        if prop['name'] == 'location':
            location_from_agent = prop['value']
            break
            
    if not location_from_agent:
        raise ValueError("Missing 'location' parameter.")

    print(f"Agent is checking for location: '{location_from_agent}'")

    impact_detected = False
    affected_assets = []
    
    db_response = table.scan() # Get ALL items
    items = db_response.get('Items', [])
    
    agent_location_words = set(location_from_agent.lower().replace(',', '').split())
    significant_words = agent_location_words - STOP_WORDS
    
    print(f"Significant words being searched: {significant_words}")

    if significant_words:
        for item in items:
            for node in item.get('nodes', []):
                # Check if any significant word is a substring of the node name
                if any(word in node.lower() for word in significant_words):
                    impact_detected = True
                    affected_assets.append(item['assetId'])
                    print(f"  MATCH FOUND: '{significant_words}' in '{node.lower()}' for asset {item['assetId']}")
                    break # Move to the next item

    affected_assets = list(set(affected_assets))
    result = { 'impact_detected': impact_detected, 'affected_assets': affected_assets }
    print(f"Truly smarter assessment result: {result}")

    # The rest of the return logic is correct
    response_body = { 'application/json': { 'body': json.dumps(result) } }
    action_response = {
        'actionGroup': event['actionGroup'], 'apiPath': event['apiPath'],
        'httpMethod': event['httpMethod'], 'httpStatusCode': 200,
        'responseBody': response_body
    }
    return {
        'response': action_response, 'messageVersion': event['messageVersion'],
        'sessionAttributes': event.get('sessionAttributes', {}),
        'promptSessionAttributes': event.get('promptSessionAttributes', {})
    }