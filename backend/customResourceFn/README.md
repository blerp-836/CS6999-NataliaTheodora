# This Lambda function does the following:

- It imports necessary types from `aws-lambda` and the AWS SDK for JavaScript v3.
- It creates a `LambdaClient` instance to interact with the Lambda service.
- The `handler` function is the entry point for the Lambda. It takes a `CloudFormationCustomResourceEvent` as input and returns a `CloudFormationCustomResourceResponse`.
- It retrieves the name of the target Lambda function from an environment variable `TARGET_FUNCTION_NAME`.
- For 'Create' and 'Update' events, it invokes the target Lambda function using the `InvokeCommand`, passing the `ResourceProperties` from the CloudFormation event.
- For 'Delete' events, it performs a simple deletion operation (you can customize this as needed).
- It returns a success or failure response based on the outcome of the operation.

# Purpose

The AWS Cloudformation service does not currently support IPv6.  Thus, functions that run inside a VPC (i.e., functions that have a VpcConfig), where the VPC has only an IPv6 egress-only Internet gateway and has no configured NAT gateway cannot send signals to the CloudFormation API during resource creation.  This function should not have a VpcConfig, so that it does not run inside the VPC.  It can invoke a function that does run inside the VPC, such as the DB Bootstrap function, and act as a bridge between that function and the AWS CloudFormation API.

## Usage

To use this Lambda function as a custom resource in your CloudFormation template, you would include something like this:

```yaml
Resources:
  MyCustomResource:
    Type: Custom::MyResource
    Properties:
      ServiceToken: !GetAtt MyLambdaFunction.Arn
      # Add any other properties you want to pass to your Lambda function

  MyLambdaFunction:
    Type: AWS::Lambda::Function
    Properties:
      Handler: index.handler
      Role: !GetAtt LambdaExecutionRole.Arn
      Code:
        ZipFile: |
          # Your Lambda function code here
      Runtime: nodejs20.x
      Environment:
        Variables:
          TARGET_FUNCTION_NAME: !Ref TargetLambdaFunction
    Metadata:
      BuildMethod: esbuild
      BuildProperties:
        Minify: true
        Target: "es2020"
        Sourcemap: true
        EntryPoints: 
        - customInvoker.ts

  LambdaExecutionRole:
    Type: AWS::IAM::Role
    Properties:
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Principal:
              Service: lambda.amazonaws.com
            Action: sts:AssumeRole
      ManagedPolicyArns:
        - arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
      Policies:
        - PolicyName: InvokeLambda
          PolicyDocument:
            Version: '2012-10-17'
            Statement:
              - Effect: Allow
                Action: lambda:InvokeFunction
                Resource: !GetAtt TargetLambdaFunction.Arn

  TargetLambdaFunction:
    Type: AWS::Lambda::Function
    Properties:
      Handler: index.handler
      Role: !GetAtt TargetLambdaExecutionRole.Arn
      VpcConfig:
        SecurityGroupIds:
          - !Ref MySecurityGroup
        SubnetIds: !Ref MySubnetIds
        Ipv6AllowedForDualStack: true

      Code:
        ZipFile: |
          # Your target Lambda function code here
      Runtime: nodejs20.x

  TargetLambdaExecutionRole:
    Type: AWS::IAM::Role
    Properties:
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Principal:
              Service: lambda.amazonaws.com
            Action: sts:AssumeRole
      ManagedPolicyArns:
        - arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
