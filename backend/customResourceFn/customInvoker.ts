import { CloudFormationCustomResourceEvent, CloudFormationCustomResourceResponse } from 'aws-lambda';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { send, SUCCESS, FAILED } from 'cfn-response-async';

const lambdaClient = new LambdaClient({});


export const handler = async (event: CloudFormationCustomResourceEvent, context: any): Promise<CloudFormationCustomResourceResponse> => {
  console.log('Received event:', JSON.stringify(event, null, 2));

  const targetFunctionName = event.ResourceProperties.TargetFunctionName;
  if (!targetFunctionName) {
    throw new Error('TargetFunctionName environment variable is not set');
  }

  try {
    let responseData: any;

    if (event.RequestType === 'Create' || event.RequestType === 'Update') {
      // Invoke the target Lambda function
      const invokeParams = {
        FunctionName: targetFunctionName,
        Payload: JSON.stringify(event),
      };

      const command = new InvokeCommand(invokeParams);
      const response = await lambdaClient.send(command);

      if (response.FunctionError) {
        throw new Error(`Target function invocation failed: ${response.FunctionError}`);
      }

      responseData = JSON.parse(Buffer.from(response.Payload as Uint8Array).toString());
      if (responseData.status == 'FAILED') {
        throw new Error(`Target function invocation failed: ${responseData.data}`);
      }
    } else if (event.RequestType === 'Delete') {
      // Handle deletion if necessary
      responseData = { message: 'Resource deleted' };
    }

    await send(event, context, SUCCESS, responseData, 'None');
    return {
      Status: 'SUCCESS',
      RequestId: event.RequestId,
      LogicalResourceId: event.LogicalResourceId,
      StackId: event.StackId,
      PhysicalResourceId: event.PhysicalResourceId || 'CustomResourceId',
      Data: responseData,
    };
  } catch (error) {
    console.error('Error:', error);
    const responseData = { Data: error.toString() };
    await send(event, context, FAILED, responseData, 'None');
    return {
      Status: 'FAILED',
      RequestId: event.RequestId,
      LogicalResourceId: event.LogicalResourceId,
      StackId: event.StackId,
      PhysicalResourceId: event.PhysicalResourceId || 'CustomResourceId',
      Reason: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
};
