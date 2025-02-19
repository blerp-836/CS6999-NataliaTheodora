# Cognito Authentication for API Gateway

This project sets up AWS Cognito resources for API Gateway authentication using AWS Serverless Application Model (SAM).

## Project Description

This AWS SAM template creates a comprehensive Cognito authentication setup for API Gateway. It establishes a Cognito User Pool with associated clients and resource servers, designed to secure API access for two distinct applications: "caliper" and "eduapi".

The main features of this authentication setup include:
- A Cognito User Pool with email as the auto-verified attribute
- A User Pool Domain for hosting the authentication interface
- Two Cognito User Pool Clients, one each for "caliper" and "eduapi"
- A Resource Server with a defined scope for API access
- AWS Systems Manager (SSM) Parameter Store entries for storing important IDs and ARNs

This setup allows for secure, OAuth 2.0 compliant authentication flows, specifically the client credentials flow, which is suitable for server-to-server API authentication scenarios.

## Repository Structure

```
.
└── HEReferenceDataPipeline
    └── cognito
        └── template.yaml
```

The `template.yaml` file in the `cognito` directory is the core of this project. It contains the AWS SAM template that defines all the Cognito resources and their configurations.

## Usage Instructions

### Prerequisites

- AWS CLI installed and configured
- AWS SAM CLI installed
- Appropriate AWS permissions to create Cognito resources

### Deployment

1. See [Deployment](../README.md#build-and-deploy)

### Configuration

The template creates several SSM Parameter Store entries that you can use in your applications:

- `/${SSMPrefix}/auth/user-pool-id`: Cognito User Pool ID
- `/${SSMPrefix}/auth/user-pool-arn`: Cognito User Pool ARN
- `/${SSMPrefix}/auth/caliper-user-pool-client-id`: Client ID for the "caliper" application
- `/${SSMPrefix}/auth/eduapi-user-pool-client-id`: Client ID for the "eduapi" application

You can retrieve these values using the AWS CLI or AWS SDKs in your applications.

### Integration

To integrate this authentication setup with your API Gateway:

1. In API Gateway, create a new authorizer.
2. Choose "Cognito" as the authorizer type.
3. Select the User Pool created by this template.
4. Configure your API routes to use this authorizer.

### Client Authentication

For client applications to authenticate:

1. Use the appropriate Client ID ("caliper" or "eduapi").
2. Implement the OAuth 2.0 client credentials flow.
3. Request the "analytics/api" scope when obtaining access tokens.

## Data Flow

The authentication flow for this setup follows the OAuth 2.0 client credentials grant type:

1. Client application requests an access token from Cognito
2. Cognito validates the client credentials
3. Cognito issues an access token with the requested scope
4. Client includes the access token in API requests to API Gateway
5. API Gateway validates the token with Cognito
6. If valid, API Gateway forwards the request to the backend

```
Client App -> Cognito (token request)
Cognito -> Client App (access token)
Client App -> API Gateway (API request with token)
API Gateway -> Cognito (token validation)
API Gateway -> Backend API (if token is valid)
```

Note: Ensure that your client applications securely store their client secrets and use HTTPS for all communications.

## Infrastructure

The `template.yaml` file defines the following AWS resources:

### Cognito User Pool
- Type: `AWS::Cognito::UserPool`
- Name: `${pEnv}UserPool`
- Auto-verified attributes: email

### Cognito User Pool Domain
- Type: `AWS::Cognito::UserPoolDomain`
- Domain: Uses the `SSMPrefix` parameter

### Cognito User Pool Resource Server
- Type: `AWS::Cognito::UserPoolResourceServer`
- Identifier: analytics
- Scope: api

### Cognito User Pool Clients
1. Caliper Client
   - Type: `AWS::Cognito::UserPoolClient`
   - Name: caliper
2. EduApi Client
   - Type: `AWS::Cognito::UserPoolClient`
   - Name: eduapi

Both clients are configured for the client credentials OAuth flow and have access to the "analytics/api" scope.

### SSM Parameters
- User Pool ID: `/${SSMPrefix}/auth/user-pool-id`
- User Pool ARN: `/${SSMPrefix}/auth/user-pool-arn`
- Caliper Client ID: `/${SSMPrefix}/auth/caliper-user-pool-client-id`
- EduApi Client ID: `/${SSMPrefix}/auth/eduapi-user-pool-client-id`

These SSM parameters store important identifiers for easy retrieval by other applications or services.

## Further Development

### Adding new clients

To add a new client to the Cognito User Pool, follow these steps to update the `template.yaml` file:

1. Add a new `AWS::Cognito::UserPoolClient` resource to the template. Use the existing clients as a reference. For example:

```yaml
NewClientUserPoolClient:
  Type: AWS::Cognito::UserPoolClient
  DependsOn:
    - AnalyticsResourceServer
  Properties:
    ClientName: newclient
    GenerateSecret: true
    UserPoolId: !Ref CognitoUserPool
    EnableTokenRevocation: true
    AllowedOAuthFlows:
      - client_credentials
    AllowedOAuthScopes:
      - analytics/api
    AllowedOAuthFlowsUserPoolClient: true
```

2. Add a new SSM Parameter to store the client ID:

```yaml
NewClientUserPoolAppClientSSM:
  Type: AWS::SSM::Parameter
  Properties:
    Type: String
    Name: !Sub /${SSMPrefix}/auth/newclient-user-pool-client-id
    Value: !Ref NewClientUserPoolClient
```

3. (Optional) Add an output for the new client ID:

```yaml
Outputs:
  NewClientAppClientId:
    Description: "Cognito App Client ID for New Client"
    Value: !Ref NewClientUserPoolClient
```

4. Deploy the updated template using the AWS SAM CLI or your preferred deployment method.

Remember to replace "newclient" with your actual client name and adjust any other properties as needed for your specific use case.

### Rotate existing client secrets

To rotate client secrets for existing Cognito User Pool clients, follow these steps:

1. Using the AWS CLI:

```bash
aws cognito-idp update-user-pool-client \
    --user-pool-id <your-user-pool-id> \
    --client-id <your-client-id> \
    --generate-secret
```

Replace `<your-user-pool-id>` with the Cognito User Pool ID and `<your-client-id>` with the Client ID of the app client you want to rotate the secret for.

2. Using the AWS Console:
    * Navigate to the Amazon Cognito console
    * Select "Manage User Pools"
    * Choose your User Pool
    * Go to "App clients" under "General settings"
    * Select the app client you want to update
    * Click "Edit app client"
    * Check the box for "Generate new client secret"
    * Click "Save changes"

After rotating the secret, make sure to update any applications or services that use the client secret with the new value. The old secret will no longer be valid.

Note: Rotating client secrets will invalidate any existing tokens issued for that client. Ensure that your applications can handle this change gracefully, potentially by implementing a mechanism to refresh tokens or re-authenticate when necessary.