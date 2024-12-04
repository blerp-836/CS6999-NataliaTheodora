FROM flyway/flyway:7.12

USER root
RUN apt-get update && \
    mkdir -p /aws-lambda-rie && \
    curl -Lo /aws-lambda-rie/aws-lambda-rie https://github.com/aws/aws-lambda-runtime-interface-emulator/releases/latest/download/aws-lambda-rie && \
    chmod +x /aws-lambda-rie/aws-lambda-rie && \
    apt-get -y install jq awscli curl vim

COPY flyway-files /
RUN chown -R flyway:flyway /flyway 

USER flyway
RUN chmod a+x /flyway/flyway

# Execute the command migrate
ENTRYPOINT ["bash", "/entry.sh"]
