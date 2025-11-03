# Atlas AI: Autonomous Supply Chain Risk Monitoring Agent

**An intelligent, autonomous AI agent that proactively monitors global news, assesses real-time impact on your supply chain, and visualizes alerts on an interactive 3D global dashboard.**

Built for the **AWS AI Agent Global Hackathon**.

https://master.da7w1vlhec58y.amplifyapp.com/

<img width="927" height="455" alt="image" src="https://github.com/user-attachments/assets/ca8c28d9-4daa-43ae-bd04-9dbc60fd3e1f" />

---

## 1. The Problem: From Reactive to Proactive

Global supply chains are the lifeblood of modern commerce, but they are incredibly fragile. Operations teams today rely on manual processes to monitor a flood of unstructured news, social media, and intelligence reports for potential disruptions. This reactive approach creates critical blind spots, where a single unforeseen event—a natural disaster, a port strike, or geopolitical unrest—can trigger a cascade of costly delays, lost revenue, and reputational damage. The core challenge is the inability to translate real-time, unstructured world events into immediate, actionable intelligence specific to a company's unique operational footprint.

## 2. Our Solution: Atlas, Your Autonomous Agent

To solve this critical gap, we have built **Atlas**, a proactive threat monitoring system powered by a sophisticated AI agent built on **Amazon Bedrock**. Atlas transforms risk management from a manual, reactive process into an autonomous, real-time intelligence engine.

Instead of waiting for human analysis, Atlas works 24/7 to:

1.  **Continuously Ingest & Analyze** unstructured data from live global news feeds.
2.  **Use AI Reasoning** (powered by **Amazon Bedrock AgentCore**) to understand the event and its location.
3.  **Execute Custom Tools** to instantly cross-reference the event's location against our company's specific supply chain routes.
4.  **Trigger Automated Actions** if an impact is detected, creating a high-priority incident and plotting it on the global dashboard in real-time.

## 3. Core Features

*   **Autonomous News Scanning:** A "fire-and-forget" function that continuously scans global news for relevant events.
*   **AI-Powered Impact Assessment:** Uses a Bedrock Agent to reason about news articles and decide whether to use tools for deeper analysis.
*   **Dynamic Tool Use:** The agent autonomously invokes custom tools (`ImpactAssessorTool`, `NotificationTool`) to interact with databases and APIs.
*   **Real-time 3D Visualization:** New incidents are pushed to a 3D Mapbox globe via AWS AppSync subscriptions, providing instant visual alerts.
*   **Interactive Command Center:** A chat interface allows operators to directly query the Atlas agent about specific locations or events.
*   **Centralized Incident Dashboard:** A clickable list of all active incidents for quick navigation and assessment.

## 4. Technical Architecture

Atlas is a fully serverless, event-driven application built on AWS. At its heart is **Amazon Bedrock AgentCore**, which orchestrates a set of powerful tools built with AWS Lambda.

**Key Services Used:**

*   **AI Core:**
    *   **Amazon Bedrock Agent:** The "brain" of the operation, handling the reasoning and tool-use (ReAct) loop.
*   **Backend & Tools:**
    *   **AWS Lambda:** Powers all tools and backend logic, including the autonomous news scanner, the agent's tools, and the chat API.
    *   **Amazon API Gateway:** Provides secure REST endpoints (`/chat`, `/scan-news`) for the frontend to interact with the agent.
    *   **AWS AppSync:** Manages the real-time GraphQL API, handling incident creation (mutations) and pushing live updates to the frontend (subscriptions).
    *   **Amazon DynamoDB:** Two tables store our core business data: one for supply chain routes and another for active incidents.
    *   **Amazon Location Service:** Used by the `NotificationTool` to geocode event locations.
*   **Frontend:**
    *   **React:** For the interactive user interface.
    *   **AWS Amplify Hosting:** For continuous deployment and secure hosting of the frontend.
    *   **Mapbox GL JS:** For the 3D interactive globe visualization.

## 5. Getting Started & Setup

### Prerequisites
*   An AWS Account
*   Node.js and npm
*   Git
*   An API key from [NewsAPI.org](https://newsapi.org/)

### Backend Setup
1.  **Deploy Lambdas:** Deploy the four Python Lambda functions found in the `/lambda_functions` directory.
2.  **Set Environment Variables:** Configure the required environment variables for each Lambda (e.g., `NEWS_API_KEY`, `AGENT_ID`, `AGENT_ALIAS_ID`, etc.).
3.  **Configure Bedrock Agent:** Set up the Bedrock Agent ("Atlas") and create two Action Groups (tools) that point to the deployed `ImpactAssessorTool` and `NotificationTool` Lambdas.
4.  **Set up DynamoDB:** Create two DynamoDB tables: one for `Routes` and one for `Incidents`. Populate the `Routes` table with your supply chain data.
5.  **Deploy AppSync & API Gateway:** Set up the AppSync API with the provided GraphQL schema and configure API Gateway with `/chat` and `/scan-news` endpoints pointing to their respective Lambdas.

### Frontend Setup
1.  **Clone the Repository:**
    ```bash
    git clone https://github.com/ash-111/Atlas-AI.git
    cd Atlas-AI
    ```
2.  **Install Dependencies:**
    ```bash
    npm install
    ```
3.  **Create `.env` file:** Create a `.env` file in the root of the project and populate it with your specific keys and endpoints. See `.env.template` for the required variables.
    ```env
    REACT_APP_MAPBOX_TOKEN="your_mapbox_token"
    REACT_APP_CHAT_API_ENDPOINT="your_api_gateway_chat_url"
    REACT_APP_NEWS_SCANNER_ENDPOINT="your_api_gateway_scan_news_url"
    REACT_APP_AWS_REGION="your_aws_region"
    REACT_APP_APPSYNC_ENDPOINT="your_appsync_graphql_endpoint"
    REACT_APP_APPSYNC_APIKEY="your_appsync_api_key"
    ```
4.  **Run the Application:**
    ```bash
    npm start
    ```
    The application will be available at `http://localhost:3000`.
