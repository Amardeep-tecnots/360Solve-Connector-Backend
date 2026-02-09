---
trigger: always_on
---
This is the .md of the file at C:\Users\Tecnots User\workspace\tecnots\Connector\Van_Sales_Unified_Architecture_v3.docx, use this for reference and better planning of the new application ecosystem.


**Van Sales Connector Ecosystem**

Unified Architecture & Implementation Plan

*Version 3.0 - Production-Ready Specification*

January 30, 2026


# **Executive Summary**
This document presents the unified architecture for the Van Sales Connector Ecosystem, synthesizing insights from previous planning iterations and addressing critical new requirements for flexible API integration modes.
## **The Evolution**
**Original Approach:** Cloud-native integration platform assuming internet-accessible ERP systems with static IPs.

**Revised Approach:** Hybrid cloud + on-premise architecture with Mini Connector agents to bridge local systems.

**Unified Approach:** Comprehensive ecosystem supporting multiple workflow patterns with flexible API integration modes (direct credentials OR user-created protected endpoints).
## **Critical Innovation: Dual API Integration Modes**
*The system supports two fundamentally different ways to integrate with ERP systems:*

- **Mode 1: Direct Credentials** - Mini/cloud connector connects directly to ERP using database credentials or API keys
- **Mode 2: User-Created Protected Endpoints** - Users build custom APIs locally, connectors discover and use these endpoints, enables selective data control

*This dual-mode approach provides maximum flexibility while maintaining security and control.*
## **Key Architectural Components**
1. **Cloud Console (Control Plane)** - Aggregator marketplace, workflow designer, AI SDK generator, WebSocket gateway, temporary data buffer
1. **Mini Connector (On-Premise Agent)** - Lightweight executable, outbound WebSocket connection, local credential vault, query executor, API discovery engine
1. **Cloud Connector (Cloud-to-Cloud)** - Direct integration with cloud services, supports both credential-based and API discovery modes
1. **Data Plane (Workflow Execution)** - Durable workflow engine (BullMQ → Temporal), activity handlers, transformation engine, state management
1. **Artifact Registry** - Versioned workflow definitions, compiled WASM SDKs, API specifications, schema metadata


# **Table of Contents**





# **1. System Architecture Overview**
The Van Sales Connector Ecosystem is a multi-tenant, hybrid cloud/on-premise integration platform that enables seamless data synchronization across diverse ERP systems, databases, and cloud services. The architecture supports multiple workflow patterns while maintaining security, isolation, and scalability.
## **1.1 Architectural Layers**
*The system consists of five primary architectural layers:*

- **Layer 1: Control Plane (Cloud Console)**
  - User-facing web interface
  - Aggregator marketplace and installation
  - Visual workflow designer
  - AI-powered SDK generation
  - Execution monitoring and control
- **Layer 2: Communication Layer**
  - WebSocket gateway for persistent connections
  - REST/GraphQL APIs for cloud connectors
  - Temporary encrypted data buffer
  - Command queue and routing
- **Layer 3: Orchestration Layer**
  - Durable workflow engine
  - Activity execution and retry logic
  - State management and persistence
  - Workflow routing and optimization
- **Layer 4: Connector Layer**
  - Mini Connectors (on-premise agents)
  - Cloud Connectors (SaaS integrations)
  - API discovery engines
  - SDK executors (WASM sandbox)
- **Layer 5: Data Storage & Registry**
  - PostgreSQL (metadata, state, schema-per-tenant)
  - S3 (artifacts, activity outputs, encrypted buffer)
  - Redis (cache, queue, session management)
  - HashiCorp Vault (secrets management)


## **1.2 Design Principles**
*The architecture adheres to the following core principles:*

- **Security by Default** - Multi-layer READ-ONLY enforcement, credentials never leave on-premise, encryption at rest and in transit
- **Tenant Isolation** - Schema-per-tenant, tier-based queue sharding, resource quotas, isolated execution contexts
- **Durability & Reliability** - Idempotent activities, crash-safe execution, deterministic workflows, automatic retries
- **Flexibility** - Support for direct credentials AND user-created APIs, multiple workflow patterns, extensible aggregator system
- **Firewall-Friendly** - Outbound-only connections from on-premise, no static IP requirements, no inbound firewall rules
- **AI-Powered Automation** - Automatic SDK generation from documentation, schema discovery, intelligent workflow suggestions
- **Operability** - Control flags for emergency operations, comprehensive monitoring, clear troubleshooting paths


# **2. Dual API Integration Modes**
The system supports two fundamentally different integration approaches, giving users flexibility in how they expose their data. Both modes are supported by both Mini Connectors (on-premise) and Cloud Connectors (SaaS), creating a unified integration experience.
## **2.1 Mode 1: Direct Credentials Integration**
In this traditional mode, connectors authenticate directly to the underlying system using database credentials or API keys. This provides the broadest access to data but requires trusting the connector with full access rights.
### **How It Works**
1. User provides database credentials or API keys during aggregator installation
1. Mini Connector stores credentials locally in encrypted vault (never sent to cloud)
1. Cloud Connector stores credentials in HashiCorp Vault (for cloud services)
1. Connector uses credentials to execute queries/API calls directly
1. READ-ONLY mode enforced by default through multi-layer validation
### **Use Cases**
- Full database extraction for analytics
- Comprehensive data migrations
- Internal system integrations with trusted access
- Systems without custom API capabilities
### **Security Measures**
- Multi-layer READ-ONLY enforcement (AI, WASM, connector, database user)
- Machine-specific encryption for local credentials
- Credentials never transmitted to cloud (on-premise)
- Vault-based encryption (cloud services)
- Comprehensive audit logging of all data access


## **2.2 Mode 2: User-Created Protected Endpoints**
In this advanced mode, users create their own backend APIs that expose only specific, curated data from their ERP systems. The connector discovers and integrates with these user-controlled endpoints, providing maximum data governance and security.
### **Architecture**
**User-Created API Layer:**

- Users build custom REST/GraphQL APIs locally (any technology stack)
- APIs implement specific endpoints that expose controlled data subsets
- User maintains full control over what data is exposed
- APIs can implement custom business logic, transformations, aggregations

**API Discovery:**

- Connector discovers available endpoints via OpenAPI/Swagger specification
- User provides API base URL + authentication method
- System parses specification and generates SDK automatically
- Endpoints become available as activities in workflow designer
### **How It Works: Detailed Flow**
1. **User builds custom API locally (example: Express.js, FastAPI, .NET)**

// Example: User-created Express.js API const express = require('express'); const app = express();  // Endpoint 1: Get filtered customers app.get('/api/customers/active', (req, res) => {   // User's custom logic   const customers = db.query(     'SELECT id, name, email FROM customers WHERE active = 1'   );   res.json(customers); });  // Endpoint 2: Get summarized sales app.get('/api/sales/summary', (req, res) => {   const summary = db.query(     'SELECT DATE(created), SUM(amount) FROM sales GROUP BY DATE(created)'   );   res.json(summary); });  app.listen(3000);

1. **User provides OpenAPI specification to connector**

openapi: 3.0.0 info:   title: My ERP API   version: 1.0.0 paths:   /api/customers/active:     get:       summary: Get active customers       responses:         '200':           description: List of active customers   /api/sales/summary:     get:       summary: Get sales summary       responses:         '200':           description: Aggregated sales data

1. User installs aggregator in Cloud Console, provides API URL and spec
1. AI SDK Generator parses spec and creates TypeScript SDK
1. SDK compiled to WASM and registered in Artifact Registry
1. Both Mini Connector and Cloud Connector can use this SDK
   - Mini Connector: If API is on same local network (e.g., localhost:3000)
   - Cloud Connector: If API is internet-accessible (e.g., https://api.company.com)
1. User creates workflows using discovered endpoints as activities
### **Use Cases**
- **Selective data exposure** - Expose only specific tables/fields, not entire database
- **Pre-aggregated data** - Provide summaries instead of raw data (e.g., sales totals vs. individual transactions)
- **Custom business logic** - Apply transformations, validations, or calculations before data leaves system
- **Compliance requirements** - Strip PII, redact sensitive fields, apply data masking
- **Complex systems** - Integrate legacy systems that require custom logic to access
- **Performance optimization** - Implement caching, pagination, or incremental sync at API layer


### **Benefits**
- **Maximum Control:** User decides exactly what data can be accessed
- **Enhanced Security:** No direct database access required, API acts as security boundary
- **Compliance:** Easier to meet data governance requirements (GDPR, HIPAA, etc.)
- **Flexibility:** Can change backend implementation without affecting workflows
- **Performance:** Implement optimizations at API layer (caching, indexes, aggregations)
- **Reusability:** Same API can be used by both Mini Connector (local) and Cloud Connector (if exposed)
### **Technical Requirements**
- **OpenAPI/Swagger Specification:** Must provide valid OpenAPI 3.0+ specification
- **Authentication:** Support for API keys, OAuth 2.0, JWT, or Basic Auth
- **Network Accessibility:**
  - Mini Connector: API must be accessible from same network (localhost or local IP)
  - Cloud Connector: API must be internet-accessible with HTTPS
- **Response Format:** JSON or XML (JSON preferred)
- **Error Handling:** Standard HTTP status codes and structured error responses


## **2.3 Connector Coordination for User-Created APIs**
When both Mini Connector and Cloud Connector use the same user-created API, the system coordinates their behavior to ensure optimal performance and prevent conflicts.
### **Routing Logic**
*The system automatically determines which connector to use based on:*

- **API Accessibility:**
  - If API is localhost/local IP → Use Mini Connector (if available)
  - If API is internet-accessible → Can use either connector
- **Workflow Pattern:**
  - Local-only workflow → Prefer Mini Connector
  - Cloud-to-cloud workflow → Use Cloud Connector
  - Hybrid workflow → Use both as needed
- **Performance Considerations:**
  - Local execution faster (no cloud buffer overhead)
  - Cloud execution better for complex transformations
### **Shared SDK Registry**
*Both connectors reference the same SDK artifacts in the Artifact Registry:*

- Single SDK generated from OpenAPI spec
- Compiled to WASM once, used by both connectors
- Version management ensures consistency
- Updates to API spec trigger SDK regeneration for both connectors
### **Example: Hybrid Workflow Using Same API**
*Scenario: User has created API at http://localhost:3000, also exposed at https://api.company.com*

**Workflow: Extract local ERP data → Transform in cloud → Load to Salesforce**

1. Activity 1 (Extract): Mini Connector calls http://localhost:3000/api/customers
   - Fast local execution, no network overhead
   - Data uploaded to cloud buffer
1. Activity 2 (Transform): Cloud worker processes data
   - Fetches from buffer, applies transformations
   - Stores result back in buffer
1. Activity 3 (Load): Cloud Connector calls Salesforce API
   - Direct cloud-to-cloud integration
   - No Mini Connector involvement needed


## **2.4 API Discovery & Registration Process**
The API discovery process enables automatic integration with user-created endpoints through standardized specification parsing and SDK generation.
### **Discovery Methods**
1. **Manual Specification Upload**
   - User uploads OpenAPI YAML/JSON file
   - System parses and validates specification
   - AI extracts operations, schemas, authentication
1. **Specification URL**
   - User provides URL to OpenAPI spec (e.g., http://localhost:3000/openapi.json)
   - System fetches and parses specification
   - Can be refreshed to detect API updates
1. **Auto-Discovery (Future)**
   - Mini Connector scans local network for APIs advertising OpenAPI specs
   - Uses mDNS/DNS-SD for service discovery
   - Presents discovered APIs to user for approval
### **Registration Workflow**
1. User navigates to Aggregator Marketplace in Cloud Console
1. Selects 'Add Custom API Aggregator'
1. Provides:
   - Aggregator name (e.g., 'My ERP API')
   - Base URL (http://localhost:3000 or https://api.company.com)
   - OpenAPI specification (upload or URL)
   - Authentication method and credentials
   - Accessibility (local-only, internet-accessible, or both)
1. System validates specification
   - Checks OpenAPI version compatibility
   - Validates required fields (paths, operations, schemas)
   - Tests connectivity to base URL
1. AI SDK Generator processes specification
   - Parses operations and parameters
   - Generates TypeScript SDK code
   - Compiles to WASM
   - Runs security scan and tests
1. SDK registered in Artifact Registry
   - Assigned version number
   - Stored alongside other aggregator SDKs
   - Available to both Mini and Cloud connectors
1. Operations become available in Workflow Designer
   - Each endpoint appears as a separate activity
   - Parameters auto-populate from spec
   - Response schemas used for type validation


### **API Update Handling**
*When users update their API implementations, the system manages versioning and compatibility:*

- **Specification Updates:**
  - User uploads new OpenAPI spec or refreshes URL
  - System detects changes (new endpoints, modified schemas, etc.)
  - Generates new SDK version
- **Version Compatibility:**
  - Existing workflows continue using old SDK version
  - New workflows use latest SDK version
  - Users can manually upgrade workflows to new version
- **Breaking Changes:**
  - System detects breaking changes (removed endpoints, changed parameters)
  - Warns users about affected workflows
  - Provides migration assistance


## **2.5 Security Considerations for User-Created APIs**
While user-created APIs provide maximum control, they also introduce unique security considerations that must be addressed.
### **Validation & Trust**
- **Specification Validation:**
  - Verify OpenAPI spec is well-formed and complete
  - Check for security definitions (auth requirements)
  - Validate response schemas match actual API responses
- **SDK Security Scanning:**
  - Generated SDK code undergoes same security scan as direct credential mode
  - WASM sandbox prevents malicious code execution
  - Network egress filtering limits which domains can be accessed
- **User Responsibility:**
  - Users are responsible for securing their own API implementations
  - System provides guidelines and best practices
  - Audit logs track all access to user APIs
### **Network Security**
- **Local APIs (Mini Connector):**
  - All communication stays within local network
  - No data transmitted to cloud during API call (only results go to buffer)
  - Mini Connector validates SSL certificates for local HTTPS APIs
- **Internet-Accessible APIs (Cloud Connector):**
  - Require HTTPS (TLS 1.3+)
  - Validate SSL certificates
  - Support for IP whitelisting
  - Rate limiting to prevent abuse
### **Authentication & Authorization**
- **Supported Methods:**
  - API Keys (header or query parameter)
  - OAuth 2.0 (authorization code, client credentials)
  - JWT (Bearer tokens)
  - Basic Auth (HTTPS only)
- **Credential Storage:**
  - Mini Connector: Local encrypted vault
  - Cloud Connector: HashiCorp Vault
  - Credentials never logged or transmitted in plaintext
- **Token Refresh:**
  - Automatic refresh for OAuth 2.0 tokens
  - Alerts when manual credential rotation needed
### **Audit & Compliance**
- All API calls logged with:
  - Timestamp, tenant ID, user ID
  - API endpoint called
  - Parameters (sanitized, no sensitive data)
  - Response status and size
  - Workflow and execution context
- Immutable audit trail stored in:
  - PostgreSQL (workflow\_execution\_events table)
  - S3 (long-term archive)
  - SIEM integration for real-time monitoring


# **3. Comprehensive Workflow Patterns**
The unified architecture supports a wide range of workflow patterns, from simple local operations to complex multi-hop hybrid integrations. This section details each pattern with concrete examples and implementation guidance.
## **3.1 Local-Only Workflows**
*These workflows operate entirely within the on-premise environment using Mini Connector. No data leaves the local network during execution.*
### **Pattern 3.1.1: Local Database to Local Database**
**Use Case:** Synchronize data between two on-premise databases (e.g., MySQL to PostgreSQL)

**Flow:**

1. Mini Connector extracts data from MySQL (localhost:3306)
1. Optional: Send to cloud buffer for transformations
1. Mini Connector loads data to PostgreSQL (localhost:5432)

**Characteristics:**

- Fastest execution (no network latency)
- Maximum data privacy (stays on premises)
- Still benefits from orchestration and monitoring
### **Pattern 3.1.2: Local ERP to User-Created Local API**
**Use Case:** Extract from SAP, load to custom API running on same network

**Flow:**

1. Mini Connector extracts from SAP using direct credentials
1. Optional transformations locally or in cloud
1. Mini Connector calls user API at http://localhost:3000/api/receive-data

**Benefits:**

- User API can implement custom validation/processing
- Data never leaves premises
- Flexible destination logic controlled by user


## **3.2 Cloud-to-Cloud Workflows**
*These workflows integrate cloud services directly without on-premise components. Cloud Connector handles all operations.*
### **Pattern 3.2.1: SaaS to SaaS Integration**
**Use Case:** Sync Salesforce contacts to Mailchimp subscribers

**Flow:**

1. Cloud Connector extracts from Salesforce API (direct credentials)
1. Cloud worker transforms: map Salesforce fields to Mailchimp schema
1. Cloud Connector loads to Mailchimp API (direct credentials)

**Characteristics:**

- No on-premise components needed
- Fast cloud-native execution
- Credentials stored in HashiCorp Vault
### **Pattern 3.2.2: Cloud Service to Internet-Accessible User API**
**Use Case:** Extract from Snowflake, send to user's public API

**Flow:**

1. Cloud Connector queries Snowflake warehouse
1. Cloud worker applies transformations
1. Cloud Connector POSTs to https://api.company.com/webhook

**Benefits:**

- User maintains control over data ingestion
- Can implement custom rate limiting, validation, etc.


## **3.3 Hybrid Workflows**
*These workflows span on-premise and cloud environments, leveraging both Mini Connector and Cloud Connector as needed.*
### **Pattern 3.3.1: On-Premise to Cloud (Standard)**
**Use Case:** Extract from local MySQL, load to Snowflake warehouse

**Flow:**

1. Mini Connector extracts from MySQL (localhost)
1. Data uploaded to cloud buffer (encrypted)
1. Cloud worker transforms data
1. Cloud Connector loads to Snowflake

**Data Security:**

- Credentials never leave premises
- Data encrypted in buffer (24h TTL)
- Complete audit trail
### **Pattern 3.3.2: Cloud to On-Premise**
**Use Case:** Extract from Salesforce, load to local PostgreSQL

**Flow:**

1. Cloud Connector extracts from Salesforce
1. Data stored in cloud buffer
1. Cloud sends command to Mini Connector
1. Mini Connector downloads from buffer
1. Mini Connector inserts into local PostgreSQL
### **Pattern 3.3.3: Multi-Hop with User APIs**
**Use Case:** Local API → Transform in Cloud → User's Internet API

**Flow:**

1. Mini Connector calls http://localhost:3000/api/get-orders
1. Data uploaded to cloud buffer
1. Cloud worker applies complex transformations (joins, aggregations)
1. Cloud Connector POSTs to https://api.partner.com/receive-orders

**Advantages:**

- Both source and destination fully controlled by user APIs
- Complex transformations in cloud (better resources)
- Maximum flexibility and security


## **3.4 Specialized Workflow Patterns**
### **Pattern 3.4.1: Fan-Out (One to Many)**
**Use Case:** Extract from SAP, distribute to multiple destinations (Salesforce, Snowflake, Local DB)

**Flow:**

1. Mini Connector extracts from SAP (once)
1. Data uploaded to cloud buffer
1. Parallel execution:
   - Activity A: Cloud Connector → Salesforce
   - Activity B: Cloud Connector → Snowflake
   - Activity C: Mini Connector → Local PostgreSQL
### **Pattern 3.4.2: Fan-In (Many to One)**
**Use Case:** Aggregate data from multiple sources into single warehouse

**Flow:**

1. Parallel extraction:
   - Mini Connector → Local MySQL
   - Cloud Connector → Salesforce
   - Cloud Connector → HubSpot
1. All data streams to cloud buffer
1. Cloud worker merges/deduplicates/transforms
1. Cloud Connector loads to Snowflake
### **Pattern 3.4.3: Bi-Directional Sync**
**Use Case:** Keep on-premise CRM and Salesforce in sync (both directions)

**Implementation:**

- Two separate workflows with conflict resolution
- Change detection based on timestamps or triggers
- Idempotency keys prevent duplicate sync
### **Pattern 3.4.4: Event-Driven Workflows**
**Use Case:** Trigger workflow when new order created in ERP

**Flow:**

1. User-created API implements webhook endpoint
1. ERP configured to POST to webhook on new order
1. Webhook triggers workflow execution via API
1. Workflow processes order data and distributes


## **3.5 Workflow Routing Logic**
The system intelligently determines optimal routing for each workflow based on multiple factors.
### **Decision Matrix**

|**Scenario**|**Source**|**Destination**|**Routing Decision**|
| :- | :- | :- | :- |
|Local → Local|On-premise DB|On-premise DB|Mini Connector only (if no complex transforms)|
|Local → Cloud|On-premise DB|Cloud Service|Mini Connector → Cloud Buffer → Cloud Connector|
|Cloud → Local|Cloud Service|On-premise DB|Cloud Connector → Cloud Buffer → Mini Connector|
|Cloud → Cloud|Cloud Service|Cloud Service|Cloud Connector only (no Mini Connector)|
|Local API → Cloud|User local API|Cloud Service|Mini Connector → Cloud Buffer → Cloud Connector|
|Cloud → Local API|Cloud Service|User local API|Cloud Connector → Cloud Buffer → Mini Connector|
|Internet API → Cloud|User internet API|Cloud Service|Cloud Connector only (direct)|

### **Optimization Factors**
- **Network Locality:** Prefer local execution when possible to minimize latency
- **Transformation Complexity:** Complex transforms better in cloud (more resources)
- **Data Volume:** Large datasets may benefit from cloud processing
- **Security Requirements:** Keep sensitive data local when possible
- **Cost:** Minimize cloud buffer usage and data transfer



*[Document continues with sections 4-10...]*

*The complete document includes:*

- Component Architecture Details (Mini Connector, Cloud Console, Data Plane)
- Security Model (Multi-layer enforcement, encryption, audit logging)
- Technology Stack Decisions
- Database Schema Design
- Implementation Roadmap (12-month plan)
- Risk Assessment & Mitigation
- Production Readiness Checklist
**Van Sales Connector Ecosystem**

Unified Architecture & Implementation Plan

*Version 3.0 - Production-Ready Specification*

January 30, 2026


# **Executive Summary**
This document presents the unified architecture for the Van Sales Connector Ecosystem, synthesizing insights from previous planning iterations and addressing critical new requirements for flexible API integration modes.
## **The Evolution**
**Original Approach:** Cloud-native integration platform assuming internet-accessible ERP systems with static IPs.

**Revised Approach:** Hybrid cloud + on-premise architecture with Mini Connector agents to bridge local systems.

**Unified Approach:** Comprehensive ecosystem supporting multiple workflow patterns with flexible API integration modes (direct credentials OR user-created protected endpoints).
## **Critical Innovation: Dual API Integration Modes**
*The system supports two fundamentally different ways to integrate with ERP systems:*

- **Mode 1: Direct Credentials** - Mini/cloud connector connects directly to ERP using database credentials or API keys
- **Mode 2: User-Created Protected Endpoints** - Users build custom APIs locally, connectors discover and use these endpoints, enables selective data control

*This dual-mode approach provides maximum flexibility while maintaining security and control.*
## **Key Architectural Components**
1. **Cloud Console (Control Plane)** - Aggregator marketplace, workflow designer, AI SDK generator, WebSocket gateway, temporary data buffer
1. **Mini Connector (On-Premise Agent)** - Lightweight executable, outbound WebSocket connection, local credential vault, query executor, API discovery engine
1. **Cloud Connector (Cloud-to-Cloud)** - Direct integration with cloud services, supports both credential-based and API discovery modes
1. **Data Plane (Workflow Execution)** - Durable workflow engine (BullMQ → Temporal), activity handlers, transformation engine, state management
1. **Artifact Registry** - Versioned workflow definitions, compiled WASM SDKs, API specifications, schema metadata


# **Table of Contents**





# **1. System Architecture Overview**
The Van Sales Connector Ecosystem is a multi-tenant, hybrid cloud/on-premise integration platform that enables seamless data synchronization across diverse ERP systems, databases, and cloud services. The architecture supports multiple workflow patterns while maintaining security, isolation, and scalability.
## **1.1 Architectural Layers**
*The system consists of five primary architectural layers:*

- **Layer 1: Control Plane (Cloud Console)**
  - User-facing web interface
  - Aggregator marketplace and installation
  - Visual workflow designer
  - AI-powered SDK generation
  - Execution monitoring and control
- **Layer 2: Communication Layer**
  - WebSocket gateway for persistent connections
  - REST/GraphQL APIs for cloud connectors
  - Temporary encrypted data buffer
  - Command queue and routing
- **Layer 3: Orchestration Layer**
  - Durable workflow engine
  - Activity execution and retry logic
  - State management and persistence
  - Workflow routing and optimization
- **Layer 4: Connector Layer**
  - Mini Connectors (on-premise agents)
  - Cloud Connectors (SaaS integrations)
  - API discovery engines
  - SDK executors (WASM sandbox)
- **Layer 5: Data Storage & Registry**
  - PostgreSQL (metadata, state, schema-per-tenant)
  - S3 (artifacts, activity outputs, encrypted buffer)
  - Redis (cache, queue, session management)
  - HashiCorp Vault (secrets management)


## **1.2 Design Principles**
*The architecture adheres to the following core principles:*

- **Security by Default** - Multi-layer READ-ONLY enforcement, credentials never leave on-premise, encryption at rest and in transit
- **Tenant Isolation** - Schema-per-tenant, tier-based queue sharding, resource quotas, isolated execution contexts
- **Durability & Reliability** - Idempotent activities, crash-safe execution, deterministic workflows, automatic retries
- **Flexibility** - Support for direct credentials AND user-created APIs, multiple workflow patterns, extensible aggregator system
- **Firewall-Friendly** - Outbound-only connections from on-premise, no static IP requirements, no inbound firewall rules
- **AI-Powered Automation** - Automatic SDK generation from documentation, schema discovery, intelligent workflow suggestions
- **Operability** - Control flags for emergency operations, comprehensive monitoring, clear troubleshooting paths


# **2. Dual API Integration Modes**
The system supports two fundamentally different integration approaches, giving users flexibility in how they expose their data. Both modes are supported by both Mini Connectors (on-premise) and Cloud Connectors (SaaS), creating a unified integration experience.
## **2.1 Mode 1: Direct Credentials Integration**
In this traditional mode, connectors authenticate directly to the underlying system using database credentials or API keys. This provides the broadest access to data but requires trusting the connector with full access rights.
### **How It Works**
1. User provides database credentials or API keys during aggregator installation
1. Mini Connector stores credentials locally in encrypted vault (never sent to cloud)
1. Cloud Connector stores credentials in HashiCorp Vault (for cloud services)
1. Connector uses credentials to execute queries/API calls directly
1. READ-ONLY mode enforced by default through multi-layer validation
### **Use Cases**
- Full database extraction for analytics
- Comprehensive data migrations
- Internal system integrations with trusted access
- Systems without custom API capabilities
### **Security Measures**
- Multi-layer READ-ONLY enforcement (AI, WASM, connector, database user)
- Machine-specific encryption for local credentials
- Credentials never transmitted to cloud (on-premise)
- Vault-based encryption (cloud services)
- Comprehensive audit logging of all data access


## **2.2 Mode 2: User-Created Protected Endpoints**
In this advanced mode, users create their own backend APIs that expose only specific, curated data from their ERP systems. The connector discovers and integrates with these user-controlled endpoints, providing maximum data governance and security.
### **Architecture**
**User-Created API Layer:**

- Users build custom REST/GraphQL APIs locally (any technology stack)
- APIs implement specific endpoints that expose controlled data subsets
- User maintains full control over what data is exposed
- APIs can implement custom business logic, transformations, aggregations

**API Discovery:**

- Connector discovers available endpoints via OpenAPI/Swagger specification
- User provides API base URL + authentication method
- System parses specification and generates SDK automatically
- Endpoints become available as activities in workflow designer
### **How It Works: Detailed Flow**
1. **User builds custom API locally (example: Express.js, FastAPI, .NET)**

// Example: User-created Express.js API const express = require('express'); const app = express();  // Endpoint 1: Get filtered customers app.get('/api/customers/active', (req, res) => {   // User's custom logic   const customers = db.query(     'SELECT id, name, email FROM customers WHERE active = 1'   );   res.json(customers); });  // Endpoint 2: Get summarized sales app.get('/api/sales/summary', (req, res) => {   const summary = db.query(     'SELECT DATE(created), SUM(amount) FROM sales GROUP BY DATE(created)'   );   res.json(summary); });  app.listen(3000);

1. **User provides OpenAPI specification to connector**

openapi: 3.0.0 info:   title: My ERP API   version: 1.0.0 paths:   /api/customers/active:     get:       summary: Get active customers       responses:         '200':           description: List of active customers   /api/sales/summary:     get:       summary: Get sales summary       responses:         '200':           description: Aggregated sales data

1. User installs aggregator in Cloud Console, provides API URL and spec
1. AI SDK Generator parses spec and creates TypeScript SDK
1. SDK compiled to WASM and registered in Artifact Registry
1. Both Mini Connector and Cloud Connector can use this SDK
   - Mini Connector: If API is on same local network (e.g., localhost:3000)
   - Cloud Connector: If API is internet-accessible (e.g., https://api.company.com)
1. User creates workflows using discovered endpoints as activities
### **Use Cases**
- **Selective data exposure** - Expose only specific tables/fields, not entire database
- **Pre-aggregated data** - Provide summaries instead of raw data (e.g., sales totals vs. individual transactions)
- **Custom business logic** - Apply transformations, validations, or calculations before data leaves system
- **Compliance requirements** - Strip PII, redact sensitive fields, apply data masking
- **Complex systems** - Integrate legacy systems that require custom logic to access
- **Performance optimization** - Implement caching, pagination, or incremental sync at API layer


### **Benefits**
- **Maximum Control:** User decides exactly what data can be accessed
- **Enhanced Security:** No direct database access required, API acts as security boundary
- **Compliance:** Easier to meet data governance requirements (GDPR, HIPAA, etc.)
- **Flexibility:** Can change backend implementation without affecting workflows
- **Performance:** Implement optimizations at API layer (caching, indexes, aggregations)
- **Reusability:** Same API can be used by both Mini Connector (local) and Cloud Connector (if exposed)
### **Technical Requirements**
- **OpenAPI/Swagger Specification:** Must provide valid OpenAPI 3.0+ specification
- **Authentication:** Support for API keys, OAuth 2.0, JWT, or Basic Auth
- **Network Accessibility:**
  - Mini Connector: API must be accessible from same network (localhost or local IP)
  - Cloud Connector: API must be internet-accessible with HTTPS
- **Response Format:** JSON or XML (JSON preferred)
- **Error Handling:** Standard HTTP status codes and structured error responses


## **2.3 Connector Coordination for User-Created APIs**
When both Mini Connector and Cloud Connector use the same user-created API, the system coordinates their behavior to ensure optimal performance and prevent conflicts.
### **Routing Logic**
*The system automatically determines which connector to use based on:*

- **API Accessibility:**
  - If API is localhost/local IP → Use Mini Connector (if available)
  - If API is internet-accessible → Can use either connector
- **Workflow Pattern:**
  - Local-only workflow → Prefer Mini Connector
  - Cloud-to-cloud workflow → Use Cloud Connector
  - Hybrid workflow → Use both as needed
- **Performance Considerations:**
  - Local execution faster (no cloud buffer overhead)
  - Cloud execution better for complex transformations
### **Shared SDK Registry**
*Both connectors reference the same SDK artifacts in the Artifact Registry:*

- Single SDK generated from OpenAPI spec
- Compiled to WASM once, used by both connectors
- Version management ensures consistency
- Updates to API spec trigger SDK regeneration for both connectors
### **Example: Hybrid Workflow Using Same API**
*Scenario: User has created API at http://localhost:3000, also exposed at https://api.company.com*

**Workflow: Extract local ERP data → Transform in cloud → Load to Salesforce**

1. Activity 1 (Extract): Mini Connector calls http://localhost:3000/api/customers
   - Fast local execution, no network overhead
   - Data uploaded to cloud buffer
1. Activity 2 (Transform): Cloud worker processes data
   - Fetches from buffer, applies transformations
   - Stores result back in buffer
1. Activity 3 (Load): Cloud Connector calls Salesforce API
   - Direct cloud-to-cloud integration
   - No Mini Connector involvement needed


## **2.4 API Discovery & Registration Process**
The API discovery process enables automatic integration with user-created endpoints through standardized specification parsing and SDK generation.
### **Discovery Methods**
1. **Manual Specification Upload**
   - User uploads OpenAPI YAML/JSON file
   - System parses and validates specification
   - AI extracts operations, schemas, authentication
1. **Specification URL**
   - User provides URL to OpenAPI spec (e.g., http://localhost:3000/openapi.json)
   - System fetches and parses specification
   - Can be refreshed to detect API updates
1. **Auto-Discovery (Future)**
   - Mini Connector scans local network for APIs advertising OpenAPI specs
   - Uses mDNS/DNS-SD for service discovery
   - Presents discovered APIs to user for approval
### **Registration Workflow**
1. User navigates to Aggregator Marketplace in Cloud Console
1. Selects 'Add Custom API Aggregator'
1. Provides:
   - Aggregator name (e.g., 'My ERP API')
   - Base URL (http://localhost:3000 or https://api.company.com)
   - OpenAPI specification (upload or URL)
   - Authentication method and credentials
   - Accessibility (local-only, internet-accessible, or both)
1. System validates specification
   - Checks OpenAPI version compatibility
   - Validates required fields (paths, operations, schemas)
   - Tests connectivity to base URL
1. AI SDK Generator processes specification
   - Parses operations and parameters
   - Generates TypeScript SDK code
   - Compiles to WASM
   - Runs security scan and tests
1. SDK registered in Artifact Registry
   - Assigned version number
   - Stored alongside other aggregator SDKs
   - Available to both Mini and Cloud connectors
1. Operations become available in Workflow Designer
   - Each endpoint appears as a separate activity
   - Parameters auto-populate from spec
   - Response schemas used for type validation


### **API Update Handling**
*When users update their API implementations, the system manages versioning and compatibility:*

- **Specification Updates:**
  - User uploads new OpenAPI spec or refreshes URL
  - System detects changes (new endpoints, modified schemas, etc.)
  - Generates new SDK version
- **Version Compatibility:**
  - Existing workflows continue using old SDK version
  - New workflows use latest SDK version
  - Users can manually upgrade workflows to new version
- **Breaking Changes:**
  - System detects breaking changes (removed endpoints, changed parameters)
  - Warns users about affected workflows
  - Provides migration assistance


## **2.5 Security Considerations for User-Created APIs**
While user-created APIs provide maximum control, they also introduce unique security considerations that must be addressed.
### **Validation & Trust**
- **Specification Validation:**
  - Verify OpenAPI spec is well-formed and complete
  - Check for security definitions (auth requirements)
  - Validate response schemas match actual API responses
- **SDK Security Scanning:**
  - Generated SDK code undergoes same security scan as direct credential mode
  - WASM sandbox prevents malicious code execution
  - Network egress filtering limits which domains can be accessed
- **User Responsibility:**
  - Users are responsible for securing their own API implementations
  - System provides guidelines and best practices
  - Audit logs track all access to user APIs
### **Network Security**
- **Local APIs (Mini Connector):**
  - All communication stays within local network
  - No data transmitted to cloud during API call (only results go to buffer)
  - Mini Connector validates SSL certificates for local HTTPS APIs
- **Internet-Accessible APIs (Cloud Connector):**
  - Require HTTPS (TLS 1.3+)
  - Validate SSL certificates
  - Support for IP whitelisting
  - Rate limiting to prevent abuse
### **Authentication & Authorization**
- **Supported Methods:**
  - API Keys (header or query parameter)
  - OAuth 2.0 (authorization code, client credentials)
  - JWT (Bearer tokens)
  - Basic Auth (HTTPS only)
- **Credential Storage:**
  - Mini Connector: Local encrypted vault
  - Cloud Connector: HashiCorp Vault
  - Credentials never logged or transmitted in plaintext
- **Token Refresh:**
  - Automatic refresh for OAuth 2.0 tokens
  - Alerts when manual credential rotation needed
### **Audit & Compliance**
- All API calls logged with:
  - Timestamp, tenant ID, user ID
  - API endpoint called
  - Parameters (sanitized, no sensitive data)
  - Response status and size
  - Workflow and execution context
- Immutable audit trail stored in:
  - PostgreSQL (workflow\_execution\_events table)
  - S3 (long-term archive)
  - SIEM integration for real-time monitoring


# **3. Comprehensive Workflow Patterns**
The unified architecture supports a wide range of workflow patterns, from simple local operations to complex multi-hop hybrid integrations. This section details each pattern with concrete examples and implementation guidance.
## **3.1 Local-Only Workflows**
*These workflows operate entirely within the on-premise environment using Mini Connector. No data leaves the local network during execution.*
### **Pattern 3.1.1: Local Database to Local Database**
**Use Case:** Synchronize data between two on-premise databases (e.g., MySQL to PostgreSQL)

**Flow:**

1. Mini Connector extracts data from MySQL (localhost:3306)
1. Optional: Send to cloud buffer for transformations
1. Mini Connector loads data to PostgreSQL (localhost:5432)

**Characteristics:**

- Fastest execution (no network latency)
- Maximum data privacy (stays on premises)
- Still benefits from orchestration and monitoring
### **Pattern 3.1.2: Local ERP to User-Created Local API**
**Use Case:** Extract from SAP, load to custom API running on same network

**Flow:**

1. Mini Connector extracts from SAP using direct credentials
1. Optional transformations locally or in cloud
1. Mini Connector calls user API at http://localhost:3000/api/receive-data

**Benefits:**

- User API can implement custom validation/processing
- Data never leaves premises
- Flexible destination logic controlled by user


## **3.2 Cloud-to-Cloud Workflows**
*These workflows integrate cloud services directly without on-premise components. Cloud Connector handles all operations.*
### **Pattern 3.2.1: SaaS to SaaS Integration**
**Use Case:** Sync Salesforce contacts to Mailchimp subscribers

**Flow:**

1. Cloud Connector extracts from Salesforce API (direct credentials)
1. Cloud worker transforms: map Salesforce fields to Mailchimp schema
1. Cloud Connector loads to Mailchimp API (direct credentials)

**Characteristics:**

- No on-premise components needed
- Fast cloud-native execution
- Credentials stored in HashiCorp Vault
### **Pattern 3.2.2: Cloud Service to Internet-Accessible User API**
**Use Case:** Extract from Snowflake, send to user's public API

**Flow:**

1. Cloud Connector queries Snowflake warehouse
1. Cloud worker applies transformations
1. Cloud Connector POSTs to https://api.company.com/webhook

**Benefits:**

- User maintains control over data ingestion
- Can implement custom rate limiting, validation, etc.


## **3.3 Hybrid Workflows**
*These workflows span on-premise and cloud environments, leveraging both Mini Connector and Cloud Connector as needed.*
### **Pattern 3.3.1: On-Premise to Cloud (Standard)**
**Use Case:** Extract from local MySQL, load to Snowflake warehouse

**Flow:**

1. Mini Connector extracts from MySQL (localhost)
1. Data uploaded to cloud buffer (encrypted)
1. Cloud worker transforms data
1. Cloud Connector loads to Snowflake

**Data Security:**

- Credentials never leave premises
- Data encrypted in buffer (24h TTL)
- Complete audit trail
### **Pattern 3.3.2: Cloud to On-Premise**
**Use Case:** Extract from Salesforce, load to local PostgreSQL

**Flow:**

1. Cloud Connector extracts from Salesforce
1. Data stored in cloud buffer
1. Cloud sends command to Mini Connector
1. Mini Connector downloads from buffer
1. Mini Connector inserts into local PostgreSQL
### **Pattern 3.3.3: Multi-Hop with User APIs**
**Use Case:** Local API → Transform in Cloud → User's Internet API

**Flow:**

1. Mini Connector calls http://localhost:3000/api/get-orders
1. Data uploaded to cloud buffer
1. Cloud worker applies complex transformations (joins, aggregations)
1. Cloud Connector POSTs to https://api.partner.com/receive-orders

**Advantages:**

- Both source and destination fully controlled by user APIs
- Complex transformations in cloud (better resources)
- Maximum flexibility and security


## **3.4 Specialized Workflow Patterns**
### **Pattern 3.4.1: Fan-Out (One to Many)**
**Use Case:** Extract from SAP, distribute to multiple destinations (Salesforce, Snowflake, Local DB)

**Flow:**

1. Mini Connector extracts from SAP (once)
1. Data uploaded to cloud buffer
1. Parallel execution:
   - Activity A: Cloud Connector → Salesforce
   - Activity B: Cloud Connector → Snowflake
   - Activity C: Mini Connector → Local PostgreSQL
### **Pattern 3.4.2: Fan-In (Many to One)**
**Use Case:** Aggregate data from multiple sources into single warehouse

**Flow:**

1. Parallel extraction:
   - Mini Connector → Local MySQL
   - Cloud Connector → Salesforce
   - Cloud Connector → HubSpot
1. All data streams to cloud buffer
1. Cloud worker merges/deduplicates/transforms
1. Cloud Connector loads to Snowflake
### **Pattern 3.4.3: Bi-Directional Sync**
**Use Case:** Keep on-premise CRM and Salesforce in sync (both directions)

**Implementation:**

- Two separate workflows with conflict resolution
- Change detection based on timestamps or triggers
- Idempotency keys prevent duplicate sync
### **Pattern 3.4.4: Event-Driven Workflows**
**Use Case:** Trigger workflow when new order created in ERP

**Flow:**

1. User-created API implements webhook endpoint
1. ERP configured to POST to webhook on new order
1. Webhook triggers workflow execution via API
1. Workflow processes order data and distributes


## **3.5 Workflow Routing Logic**
The system intelligently determines optimal routing for each workflow based on multiple factors.
### **Decision Matrix**

|**Scenario**|**Source**|**Destination**|**Routing Decision**|
| :- | :- | :- | :- |
|Local → Local|On-premise DB|On-premise DB|Mini Connector only (if no complex transforms)|
|Local → Cloud|On-premise DB|Cloud Service|Mini Connector → Cloud Buffer → Cloud Connector|
|Cloud → Local|Cloud Service|On-premise DB|Cloud Connector → Cloud Buffer → Mini Connector|
|Cloud → Cloud|Cloud Service|Cloud Service|Cloud Connector only (no Mini Connector)|
|Local API → Cloud|User local API|Cloud Service|Mini Connector → Cloud Buffer → Cloud Connector|
|Cloud → Local API|Cloud Service|User local API|Cloud Connector → Cloud Buffer → Mini Connector|
|Internet API → Cloud|User internet API|Cloud Service|Cloud Connector only (direct)|

### **Optimization Factors**
- **Network Locality:** Prefer local execution when possible to minimize latency
- **Transformation Complexity:** Complex transforms better in cloud (more resources)
- **Data Volume:** Large datasets may benefit from cloud processing
- **Security Requirements:** Keep sensitive data local when possible
- **Cost:** Minimize cloud buffer usage and data transfer



*[Document continues with sections 4-10...]*

*The complete document includes:*

- Component Architecture Details (Mini Connector, Cloud Console, Data Plane)
- Security Model (Multi-layer enforcement, encryption, audit logging)
- Technology Stack Decisions
- Database Schema Design
- Implementation Roadmap (12-month plan)
- Risk Assessment & Mitigation
- Production Readiness Checklist
