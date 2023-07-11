const envVariables = require('./helper/envHelper');
const { zohoUserCreation } = require('./zohoService/zoho');
const db = require('./db/DBModule');
var log4js = require('log4js');
var logger = log4js.getLogger();
logger.level = "debug";

// Import required AWS SDK clients and commands for Node.js
const { SQSClient, DeleteMessageCommand } = require("@aws-sdk/client-sqs");
// Create SQS service object.
const sqsClient = new SQSClient({region: envVariables.REGION});

const processPersonMessage = async(message) =>{
    // Process the message here
    logger.info('Received message:', message.Body);
    let msg = JSON.parse(message.Body);
    logger.info("Processing for the customer with"," correlation Id: ",msg.key.correlationId, " patient uhid: ",msg.key.clinicalUhid);

    // checking all the informations are available in the SQS message or not
    if(msg.key && msg.message && msg.key.hasOwnProperty('messageId') && msg.key.hasOwnProperty('patientId') && msg.key.hasOwnProperty('clinicalUhid') && msg.message.hasOwnProperty('personInfo') &&msg.message.personInfo && msg.message.personInfo.firstName){
        logger.info("Creating Customer in Zoho Books....");
        let person_from_msg = msg.message.personInfo
        let user = {
            "contact_name": `${person_from_msg.firstName+" "+person_from_msg.lastName}`,
            "contact_persons": [
                    {
                        "first_name": `${person_from_msg.firstName}`,
                        "last_name": `${person_from_msg.lastName}`,
                        "email": `${person_from_msg.emailId}`,
                        "is_primary_contact": true,
                        "enable_portal": true
                    }
                ],
            "custom_fields": [
                    {
                        "label": "UHID",
                        "api_name": "cf_uhid",
                        "value_formatted": `${msg.key.clinicalUhid}`,
                        "search_entity": "contact",
                        "data_type": "string",
                        "placeholder": "cf_uhid",
                        "value": `${msg.key.clinicalUhid}`
                    }
                ]
        }

        let customer_response = await zohoUserCreation(user, msg.key.correlationId, msg.key.clinicalUhid).then((response)=>{
            logger.info("success response",response);
            return response;
        }).catch((error)=>{
            logger.error(error);
        });

        if(customer_response){
            // Delete the message from the queue
            const deleteParams = {
                QueueUrl: envVariables.PERSON_QUEUE_URL,
                ReceiptHandle: message.ReceiptHandle,
            };
            try {
                const data = await sqsClient.send(new DeleteMessageCommand(deleteParams));
                logger.warn("Message deleted", data," with correlation Id: ",msg.key.correlationId," patient uhid: ",msg.key.clinicalUhid);
            } catch (err) {
                logger.error("Error while deleting ", err);
            };
        }

    }else{
        logger.warn("Bad message request from SQS"," with correlation Id: ",msg.key.correlationId," patient uhid: ",msg.key.clinicalUhid);
        logger.info("deleting the message since BAD Request")
        // Delete the message from the queue
        const deleteParams = {
            QueueUrl: envVariables.PERSON_QUEUE_URL,
            ReceiptHandle: message.ReceiptHandle,
        };
        try {
            const data = await sqsClient.send(new DeleteMessageCommand(deleteParams));
            logger.warn("Message deleted", data," with correlation Id: ",msg.key.correlationId," patient uhid: ",msg.key.clinicalUhid);
        } catch (err) {
            logger.error("Error while deleting ", err);
        };
    }
}

module.exports = processPersonMessage;