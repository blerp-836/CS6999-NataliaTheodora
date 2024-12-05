## Dev env setup
1. install the [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html#getting-started-install-instructions)
1. install the [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html#install-sam-cli-instructions)
1. install [NodeJs 20](https://nodejs.org/en/download/package-manager)
1. install Typescript globally
    * npm install -g typescript
1. install [Docker](https://docs.docker.com/engine/install/)
** Later we can create a docker container with all these tools so that the host need only to have Docker installed.

## Build and Deploy
1. If an environment stack file does not already exist for the environment, create one
    * refer to [dev.aws](./dev.aws) and [qa.aws](./qa.aws) for examples
1. Run the deploy.sh script found in the top-level directory
    * ex.
      ```bash
      ./deploy.sh -s dev
      ```
    * the script will instruct you to install dependencies, if you don't already have them