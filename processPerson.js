const envVariables = require('./helper/envHelper');
const { zohoUserCreationOrUpdation } = require('./zohoService/zoho');
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
    try{
    logger.info('Received message:', message.Body);
    let msg = JSON.parse(message.Body);
    logger.info("Processing for the customer with"," correlation Id: ",msg.key.correlationId, " patient uhid: ",msg.key.clinicalUhid);

    // Regex to check email Id format provided in the message received from SQS.
    let regex = new RegExp(/(^[^\s][a-z0-9._@-]+@[a-z0-9-]+\.[a-z]{2,4}\.[a-z]{2}$)|(^[^\s][a-z0-9._@-]+@[a-z0-9-]+\.[a-z]{2,4}$)/);
    let user;
    if(msg.message.taskType.toUpperCase() == "CREATE_PERSON"){
        // checking all the informations are available in the SQS message or not
        if(msg.key && msg.message && msg.key.hasOwnProperty('messageId') && msg.key.hasOwnProperty('patientId') && msg.key.hasOwnProperty('clinicalUhid') && msg.message.hasOwnProperty('personInfo') &&msg.message.personInfo && msg.message.personInfo.firstName && regex.test(msg.message.personInfo.emailId.trim())){
            logger.info("Creating Customer in Zoho Books....");
            let person_from_msg = msg.message.personInfo
            user = {
                "contact_name": `${person_from_msg.firstName+" "+person_from_msg.lastName}`,
                "contact_persons": [
                        {
                            "first_name": `${person_from_msg.firstName}`,
                            "last_name": `${person_from_msg.lastName}`,
                            "email": `${person_from_msg.emailId.trim()}`,
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
                    ],
                "gst_treatment": "consumer",
                
            }

            // inserting user meta-data in PATIENT Table
            let patient_insertion_id = await db.Patient_Insert(msg.key.clinicalUhid, msg.key.patientId, msg.key.correlationId).then(data=>data).catch(err=>{
                logger.error(err);
                return;
            }); 

            logger.info("patient insertion successfull ", patient_insertion_id," correlation Id: ",msg.key.correlationId);
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
    }else if(msg.message.taskType.toUpperCase() == "UPDATE_PERSON"){
        user = msg.message.personInfo;
    }

        let customer_response = await zohoUserCreationOrUpdation(user, msg.key.correlationId, msg.key.clinicalUhid, msg.message.taskType.toUpperCase()).then((response)=>{
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
    }catch(error){
        logger.error("Some Error happened :", error);
    }
}

module.exports = processPersonMessage;