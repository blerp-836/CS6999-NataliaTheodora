#!/bin/bash
if [ -z "${AWS_LAMBDA_RUNTIME_API}" ]; then
    exec /aws-lambda-rie/aws-lambda-rie /bin/bash /flyway/lambda-entrypoint.sh $@
else
    /bin/bash /flyway/lambda-entrypoint.sh $@
fi
