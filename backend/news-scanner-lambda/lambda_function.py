# News Scanner Lambda (with corrected sessionId generation)
import json
import os
import boto3
import urllib.request
import urllib.parse
from datetime import datetime

# Initialize clients
bedrock_agent_runtime = boto3.client('bedrock-agent-runtime')

# Get config from environment variables
NEWS_API_KEY = os.environ.get('NEWS_API_KEY')
AGENT_ID = os.environ.get('AGENT_ID')
AGENT_ALIAS_ID = os.environ.get('AGENT_ALIAS_ID')

def lambda_handler(event, context):
    log_stream = []
    def log_and_print(message):
        print(message)
        log_stream.append(message)

    log_and_print("Starting news fetch and analysis cycle...")
    
    categories_to_query = ["business", "general"]
    all_articles = []
    
    log_and_print(f"Querying NewsAPI for top headlines in categories: {categories_to_query}")

    try:
        for category in categories_to_query:
            log_and_print(f"  - Fetching articles for category: '{category}'...")
            url = (f"https://newsapi.org/v2/top-headlines?category={category}"
                   f"&language=en&pageSize=40&apiKey={NEWS_API_KEY}")
            
            req = urllib.request.Request(url, headers={'User-Agent': 'AWS-Lambda-Agent/1.0'})
            with urllib.request.urlopen(req) as response:
                if response.status != 200:
                    log_and_print(f"    [WARNING] News API returned status {response.status} for category '{category}'. Skipping.")
                    continue
                
                response_body = response.read().decode('utf-8')
                news_data = json.loads(response_body)
                fetched_articles = news_data.get('articles', [])
                all_articles.extend(fetched_articles)
                log_and_print(f"    -> Found {len(fetched_articles)} articles.")

        unique_articles = {article['url']: article for article in all_articles}.values()
        
        sorted_articles = sorted(
            unique_articles, 
            key=lambda x: datetime.strptime(x['publishedAt'], '%Y-%m-%dT%H:%M:%SZ'), 
            reverse=True
        )
        
        articles_to_process = sorted_articles[:5]
        
        log_and_print(f"\n✅ Found {len(sorted_articles)} unique articles in total.")
        log_and_print(f"   Processing the top {len(articles_to_process)} most recent ones.\n")
        
    except Exception as e:
        log_and_print(f"[ERROR] Failed during news fetch phase: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({'logs': "\n".join(log_stream)})
        }

    if not articles_to_process:
        log_and_print("No articles found in this cycle.")
        log_and_print("✅ News analysis cycle complete.")
        return {
            'statusCode': 200,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({'logs': "\n".join(log_stream)})
        }

    # --- 2. Invoke the Bedrock Agent for each article ---
    # NEW: Using enumerate to get a safe index (0, 1, 2...) for each article
    for index, article in enumerate(articles_to_process):
        title = article.get('title', 'No Title')
        content = article.get('description', '') or article.get('content', '')
        
        if not content:
            log_and_print(f"⚠️ Skipping article with no content: {title}")
            continue
            
        input_text = f"Analyze this news: {title}. {content}"
        
        # THE FIX: Create a unique and valid sessionId using the article's index
        session_id = f"scan-{context.aws_request_id}-{index}"
        
        log_and_print(f"▶️ Invoking agent for article: {title}")
        try:
            agent_response = bedrock_agent_runtime.invoke_agent(
                agentId=AGENT_ID,
                agentAliasId=AGENT_ALIAS_ID,
                sessionId=session_id,
                inputText=input_text
            )
            
            response_body_stream = ""
            for event_chunk in agent_response.get('completion', []):
                chunk = event_chunk.get('chunk', {})
                response_body_stream += chunk.get('bytes', b'').decode('utf-8')
            
            log_and_print(f"🗣️ Agent Response: {response_body_stream}\n")
            
        except Exception as e:
            log_and_print(f"[ERROR] Failed to invoke agent for article '{title}': {str(e)}\n")
    
    log_and_print("✅ News analysis cycle complete.")
    
    return {
        'statusCode': 200,
        'headers': {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Methods': 'OPTIONS,POST'
        },
        'body': json.dumps({'logs': "\n".join(log_stream)})
    }