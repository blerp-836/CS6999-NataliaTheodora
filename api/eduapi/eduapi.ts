import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import Ajv, { JSONSchemaType } from 'ajv';
import addFormats from 'ajv-formats';
import fs from 'fs/promises';
import Ajv2019 from "ajv/dist/2019"

/**
 *
 * Event doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-input-format
 * @param {Object} event - API Gateway Lambda Proxy Input Format
 *
 * Return doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html
 * @returns {Object} object - API Gateway Lambda Proxy Output Format
 *
 */

export const lambdaHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        // validate the body contains json data
        if (!event.body) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    message: 'The message body must contain a JSON document',
                }),
            };
        }

        // verify the necessary path parameters were sent
        if (!event.pathParameters || !event.pathParameters.schema || !event.pathParameters.version) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    message: 'The request URI is missing path parameters; schema and/or version.',
                }),
            };
        }

        // get the schema name and version from the path parameters
        const schemaName = event.pathParameters.schema;
        const schemaVersion = event.pathParameters.version;
        const schemaFile = '/opt/eduapi/' + schemaVersion + '/' + schemaName + '.json';

        // validate the schema file exists
        try {
            await fs.access(schemaFile);
        } catch (err) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    message: 'The specified schema/version not found',
                }),
            };
        }
        
        // Validate the JSON object against the schema
        console.log('validating data for schemaName: ', schemaName);
        var data = JSON.parse(event.body);
        const { valid, errors } = await validateJsonWithSchema(data, schemaFile);
        if (!valid) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    message: 'Invalid JSON',
                    errors,
                }),
            };
        } else {
            console.log('JSON is valid');
        }

        // Handle the request
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'hello eduapi',
            }),
        };
    } catch (err) {
        console.log(err);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'some error happened',
            }),
        };
    }
};

/**
 * Validates a JSON object against a JSON schema.
 *
 * @param {unknown} jsonObject - The JSON object to validate.
 * @param {string} schemaPath - The path to the JSON schema file.
 * @returns {Promise<{ valid: boolean; errors: string[] | null }>} - A promise that resolves to an object indicating whether the JSON object is valid and any validation errors.
 */

async function validateJsonWithSchema<T>(jsonObject: unknown, schemaPath: string): Promise<{ valid: boolean; errors: string[] | null }> {
    try {
      // Read the schema file
      const schemaContent = await fs.readFile(schemaPath, 'utf-8');
      const schema: JSONSchemaType<T> = JSON.parse(schemaContent);
  
      // Create Ajv instance
      const ajv = new Ajv2019({ allErrors: true });
      //const ajv = new Ajv({ allErrors: true });
      addFormats(ajv);
  
      // Compile the schema
      const validate = ajv.compile(schema);
  
      // Validate the JSON object
      const valid = validate(jsonObject);
  
      if (valid) {
        return { valid: true, errors: null };
      } else {
        const errors = validate.errors?.flatMap(error => `${error.instancePath} ${error.message}`) || [];
        return { valid: false, errors };
      }
    } catch (error) {
      console.error('Error validating JSON:', error);
      return { valid: false, errors: ['An error occurred during validation'] };
    }
  }