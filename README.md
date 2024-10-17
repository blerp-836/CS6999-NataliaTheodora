## Dev env setup
1. install the [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html#getting-started-install-instructions)
1. install the [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html#install-sam-cli-instructions)
1. install [NodeJs 20](https://nodejs.org/en/download/package-manager)
1. install Typescript globally
    * npm install -g typescript
1. install [Docker](https://docs.docker.com/engine/install/)
** Later we can create a docker container with all these tools so that the host need only to have Docker installed.

## Build and Deploy
1. run npm install in the following directories
    * api/caliper
    * api/eduapi
1. run sam build in the top-level directory
1. Setup AWS account access in your terminal session
    * preferably, use temporary credentials provided by the AWS Identity Center access portal
1. run sam deploy --config-env qa
    * if you omit "--config-env qa", SAM will deploy the default environment

