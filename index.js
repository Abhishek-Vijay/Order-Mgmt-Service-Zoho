'use strict';

const envVariables = require('./helper/envHelper');
const express = require('express');
const bodyParser = require('body-parser');
const tokens = require('./zohoService/access_token_Module');
const axios = require('axios');
var log4js = require('log4js');
var logger = log4js.getLogger();
logger.level = "debug";

// Import required AWS SDK clients and commands for Node.js
const { SQSClient, ReceiveMessageCommand, SendMessageCommand } = require("@aws-sdk/client-sqs");
// Create SQS service object.
const sqsClient = new SQSClient({region: envVariables.REGION});

const invoiceParams = {
    AttributeNames: ["SentTimestamp"],
    MaxNumberOfMessages: 1,
    MessageAttributeNames: ["All"],
    QueueUrl: envVariables.INVOICE_QUEUE_URL,
    VisibilityTimeout: 10,
    WaitTimeSeconds: 10,
};

const personParams = {
    AttributeNames: ["SentTimestamp"],
    MaxNumberOfMessages: 1,
    MessageAttributeNames: ["All"],
    QueueUrl: envVariables.PERSON_QUEUE_URL,
    VisibilityTimeout: 10,
    WaitTimeSeconds: 10,
};

const db = require('./db/DBModule');
const { UUIDGenerator } = require('./helper/generator');

const app = express() // creates http server
const processInvoiceMessage = require('./processInvoice');
const processPersonMessage = require('./processPerson');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

let queueFlag = true;
// SQS Caller Function to get the queue 
const readingSQSMsg = async() =>{
    logger.info("Middleware called");
    if(queueFlag){
        try {
            let command = new ReceiveMessageCommand(invoiceParams)
            const data = await sqsClient.send(command);
            if (data.Messages) {
                processInvoiceMessage(data.Messages[0])
            } else {
                logger.warn("No messages to delete in Invoice Queue");
            }
        } catch (err) {
            logger.error("Receive Error", err);
        }
    }else{
        try {
            let command = new ReceiveMessageCommand(personParams)
            const data = await sqsClient.send(command);
            if (data.Messages) {
                processPersonMessage(data.Messages[0])
            } else {
                logger.warn("No messages to delete in Person Queue");
            }
        } catch (err) {
            logger.error("Receive Error", err);
        }
    }   

    setTimeout(()=>{
        queueFlag = !queueFlag;
        readingSQSMsg();}, 2500);
}

// API to get invoice url for mobile app to use.
app.get('/order-mgmt/patient/:uuid/order-invoice', async(req,res)=>{
    // console.log(req.params.uuid);
    await db.Order_Invoice_Urls(req.params.uuid).then(data=>{
        if(data.length){
            let formattedData = data.filter(obj=>{
                if(obj.invoice_url){
                    return obj
                }
            }).map(newobj=>{ 
                return {
                    encounterId: newobj.encounter_id,
                    invoiceNumber: newobj.invoice_number,
                    invoiceUrl: newobj.invoice_url,
                    processingStatus: newobj.processing_status,
                    paymentStatus: newobj.payment_status,
                    createdAt: newobj.created_at.toISOString().replace("T", " ")
                    // createdAt: newobj.created_at.toLocaleString().replace(",","")
                }
            });
            res.statusCode = 200;
            res.json({"clinicalUhid": data[0].clinical_uhid, "invoiceDetails":formattedData});
        }else{
            res.statusCode = 200;
            res.json(data);
        }
    }).catch(err=>{
        logger.error(err);
        res.statusCode = 404;
        res.json(err);
    });  
    
})

//API to list all the products
app.get('/order-mgmt/subscriptions/products', async (req, res) => {
let token = await tokens.get_billing_access_token();
 const correlationId = req.get('X-Correlation-ID');
 if(correlationId == null || correlationId.length == 0){
    logger.error('Correlation ID cannot be empty');
     return res.sendStatus(400);
     }
  try {
    const response = await axios.get('https://www.zohoapis.in/subscriptions/v1/products', {
      headers: {
         Authorization: `Zoho-oauthtoken ${token}`,
        'X-com-zoho-subscriptions-organizationid' : `${envVariables.ORGANIZATION_ID}`
      }
    });
        const planInfo = [];
        let responseData = JSON.parse(JSON.stringify(response.data));
        responseData.products.forEach((item) => {
          const jsonObject = {
            productId:item.product_id,
            name: item.name,
            description: item.description
          };
          // Push the generated JSON object into the array
          planInfo.push(jsonObject);
        });
        const jsonWithRoot = {
          'products': planInfo
        };
    res.statusCode = 200;
    res.json(jsonWithRoot);
  } catch (error) {
    console.error('Error while retrieving the products:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

//API to list all the plans of a  available
app.get('/order-mgmt/subscriptions/product/:productId/plans', async (req, res) => {
let token = await tokens.get_billing_access_token();
const productId = req.params.productId;
 const correlationId = req.get('X-Correlation-ID');
 if(correlationId == null || correlationId.length == 0){
    logger.error('Correlation ID cannot be empty');
     return res.sendStatus(400);
 }
 if(productId == null || productId.length == 0){
   logger.error('productId cannot be empty');
   return res.sendStatus(400);
 }
  try {
    const response = await axios.get(`https://www.zohoapis.in/subscriptions/v1/plans?product_id=${productId}`, {
      headers: {
         Authorization: `Zoho-oauthtoken ${token}`,
        'X-com-zoho-subscriptions-organizationid' : `${envVariables.ORGANIZATION_ID}`
      }
    });
        const planInfo = [];
        let responseData = JSON.parse(JSON.stringify(response.data));
        responseData.plans.forEach((item) => {
          const jsonObject = {
            name: item.name,
            code: item.plan_code,
            duration: `${item.interval} ${item.interval_unit}`,
            description: item.description,
            price:item.price_brackets[0].price
          };
          // Push the generated JSON object into the array
          planInfo.push(jsonObject);
        });
        const jsonWithRoot = {
          'productPlans': planInfo
        };
    res.statusCode = 200;
    res.json(jsonWithRoot);
  } catch (error) {
    console.error('Error while retrieving the plans:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

//API to list specific plan for given plancode
app.get('/order-mgmt/subscription/:planCode', async (req, res) => {
let token = await tokens.get_billing_access_token();
const planCode = req.params.planCode;
 const correlationId = req.get('X-Correlation-ID');
 if(correlationId == null || correlationId.length == 0){
    logger.error('Correlation ID cannot be empty');
     return res.sendStatus(400);
     }
  try {
    const response = await axios.get(`https://www.zohoapis.in/subscriptions/v1/plans/${planCode}`, {
      headers: {
         Authorization: `Zoho-oauthtoken ${token}`,
        'X-com-zoho-subscriptions-organizationid' : `${envVariables.ORGANIZATION_ID}`
      }
    });
        const planInfo = [];
        const customField = [];
        let responseData = JSON.parse(JSON.stringify(response.data));
        let item = responseData.plan;
        item.custom_fields.forEach((fieldInfo) => {
        let fieldTrimName = fieldInfo.placeholder.trim();
        let fieldName = fieldTrimName.substring(3,fieldTrimName.length)
            const customFieldObject = {
             name: fieldName,
             value: fieldInfo.value
            };
            customField.push(customFieldObject);
        });

        // adding plan details in SUBSCRIPTION_PLANS
        await db.Insert_plan_table(item.plan_code, item.name);

          const jsonObject = {
            name: item.name,
            code: item.plan_code,
            description: item.description,
            price:item.price_brackets[0].price,
            duration: `${item.interval} ${item.interval_unit}`,
            customFields: customField
          };
    res.statusCode = 200;
    res.json(jsonObject);
  } catch (error) {
    console.error('Error while retrieving the plan:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


//API to retrieve the subscriptions of a patient
app.get('/order-mgmt/patient/:patientId/subscription', async (req, res) => {
const uuid = req.params.patientId;
let token = await tokens.get_billing_access_token();

 const correlationId = req.get('X-Correlation-ID');
 if(correlationId == null || correlationId.length == 0){
    logger.error('Correlation ID cannot be empty');
     return res.sendStatus(400);
 }
 if(uuid == null || uuid.length == 0){
    logger.error('patientId cannot be empty or null');
     return res.sendStatus(400);
 }

  let patientDetails = await db.get_customer_id(uuid).then(data=>data).catch(err=>{
              logger.error(err);
               return res.sendStatus(400);
  });
const params = {
  customer_id: `${patientDetails.customer_id}`
};

const headers = {
 Authorization: `Zoho-oauthtoken ${token}`,
 'X-com-zoho-subscriptions-organizationid' : `${envVariables.ORGANIZATION_ID}`
};
  try {
    const response = await axios.get('https://www.zohoapis.in/subscriptions/v1/subscriptions', {
      params: params,
      headers: headers
    });
    const subscriptionInfo = [];
    let responseData = JSON.parse(JSON.stringify(response.data));
    responseData.subscriptions.forEach((item) => {
      const jsonObject = {
        name: item.plan_name,
        code: item.plan_code,
        description: ''
      };
      // Push the generated JSON object into the array
      subscriptionInfo.push(jsonObject);
    });
    const jsonWithRoot = {
      'subscriptionInfo': subscriptionInfo
    };
    res.statusCode = 200;
    res.json(jsonWithRoot);
  } catch (error) {
    console.error('Error while retrieving the subscriptions for a patient:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


//API to create a subscription for a patient
app.post('/order-mgmt/patient/:patientId/subscription', async (req, res) => {
 let token = await tokens.get_billing_access_token();
 const contentTypeHeader = req.get('Content-Type');
 const correlationId = req.get('X-Correlation-ID');
 let patientId = req.params.patientId;
 if(correlationId == null || correlationId.length == 0){
    logger.error('Correlation ID cannot be empty');
     return res.sendStatus(400);
 }
 if(patientId == null || patientId.length == 0){
    logger.error('patientId cannot be empty or null');
     return res.sendStatus(400);
 }

try {
// TO-DO call the zoho API to fetch customer ID (Edit: API call is done. Need to use previous code later.)
logger.info("fetching customer details from Zoho Billings .......")
let patientDetails = await db.get_customer_id(req.params.patientId).then(data=>data).catch(err=>{
            logger.error('Error while retrieving customerId from patient table.',err);
            return res.sendStatus(500);
        });
// console.log(patientDetails);

let subscriptionCode = req.body.subscriptionCode;

let subscription_logs = await db.create_subscription_logs(patientDetails.clinical_uhid, subscriptionCode).then(res=>{
    return res;
  }).catch(err=>{
    logger("plan name retreival Error", err)
  });
if(subscription_logs.subscription_status == 'SUBSCRIBED' && subscription_logs.payment_status == 'PAID'){
    logger.warn("Plan is already subscribed.");
    res.status(409).json({ error: 'This plan is already subscribed' });
}else if(subscription_logs.subscription_status == 'REQUESTED' && subscription_logs.payment_status == 'NIL'){
    let count = subscription_logs.requested_count + 1;
    await db.update_subscription_requestCount(count, subscription_logs.clinical_uhid, subscription_logs.billing_plan_code);
    const headers = {
        Authorization: `Zoho-oauthtoken ${token}`,
        'X-com-zoho-subscriptions-organizationid' : `${envVariables.ORGANIZATION_ID}`
        };

        const customerDetails = await axios.get(`https://www.zohoapis.in/subscriptions/v1/customers?cf_uhid=${patientDetails.clinical_uhid}`, {headers: headers})
        let customerDetailsResponse = JSON.parse(JSON.stringify(customerDetails.data));
        // res.json(customerId);
        
        let newSubscription = {
                    "customer_id": `${customerDetailsResponse.customers[0].customer_id}`,
                    "plan": {
                        "plan_code": `${subscriptionCode}`,
                        }
                    }

        const response = await axios.post('https://billing.zoho.in/api/v1/hostedpages/newsubscription',newSubscription,{
        headers: headers
        });
        let responseData = JSON.parse(JSON.stringify(response.data))
        let expiryTime = responseData.hostedpage.expiring_time.replace("T", " ");
        let subscriptionResponse = {
        'subscriptionStatus' : 'REQUESTED',
        'billingUrl' : `${responseData.hostedpage.url}` ,
        'urlExpiryTime' : `${expiryTime}`
        }
        res.statusCode = 200;
        res.json(subscriptionResponse);
    }
  } catch (error) {
    console.error('Error while creating the subscription for a patient:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Payment webhook for payment notification.
app.post('/paymentHook', async(req, res) => {
    // check if verification token is correct
    if (req.headers.token !== envVariables.TOKEN) {
        return res.sendStatus(401);
    }
    // print request body
    if(req.body.status){
        let processing_status;
        logger.info(req.body);
        if (req.body.status.toUpperCase() == 'PAID') processing_status = 'PAYMENT_COMPLETED';
        else if (req.body.status.toUpperCase() == 'FAILED') processing_status = 'PAYMENT_FAILED';
        else if (req.body.status.toUpperCase() == 'OVERDUE') processing_status = 'PAYMENT_OVERDUE';
        await db.Order_Update_Payment(req.body.invoice_number, processing_status, req.body.status.toUpperCase()).then(data=>data).catch(err=>{
            logger.error(err);
            return;
        });
        await db.Order_Txn_Logs_Webhook_Update(req.body.invoice_number, processing_status);
    }
    // return a text response
    const data = { type: 'Received' };
    res.json(data);
});

app.post('/subscriptionHook', async(req, res) => {
 logger.trace('Request received to update subscription details');
  logger.info("Received information in request body",req.body);
  let subscriptionId = req.body.subscriptionId;
  let customerId = req.body.customerId;
  let planCode = req.body.planCode;
//   let customerUHID = await db.get_clinical_uhid(customerId);
  let customerUHID = req.body.customerUHID;
  let paymentStatus = 'PAID';
  let subscriptionStatus = 'SUBSCRIBED';
  let customerName = req.body.customerName;
  await db.update_subscription_details(subscriptionId, customerUHID,paymentStatus,subscriptionStatus,planCode);

  let messageId = UUIDGenerator();
  let correlationId = UUIDGenerator();
  logger.info("new correlationId is:",correlationId)
  let patientId = await db.get_patient_uuid(customerUHID);
//   getting plan_name from Database
  let planName = await db.get_plan_name(planCode).then(res=>{
    return res;
  }).catch(err=>{
    logger("plan name retreival Error", err)
  }); 

  const notificationBody = {
            key: {
                messageId: messageId,
                clinicalUhid: customerUHID,
                patientId: patientId,
                correlationId: correlationId
            },
            message: {
                type: "MOBILE_PUSH",
                content: {
                    title: "Care subscription enrollment status",
                    body: `Dear ${customerName}, You have successfully subscribed with ${planName}`,
                    type: "CARE_SUBSCRIPTION" 
                }
            }
  }
  logger.info("Notification Body to be send in SQS",notificationBody);

// Notification queue
const notificationInput = { // SendMessageRequestInput
    QueueUrl: envVariables.NOTIFICATION_QUEUE_URL, // required
    MessageBody: JSON.stringify(notificationBody), // required
    DelaySeconds: 0,
    MaxNumberOfMessages: 1
  };

try {
    let command = new SendMessageCommand(notificationInput)
    const data = await sqsClient.send(command);
    if (data.MessageId) {
        logger.info("Notification message is successfully pushed with MessageId", data.MessageId)
    }
} catch (err) {
    logger.error("Send Error", err);
}

  const data = { type: 'Subscribed successfully' };
      res.send(data);
});

//app.post('/paymentFailure', async(req, res) => {
// console.log('Request received to update payment failure status');
//  console.log(req.body);
//   let customerId = req.body.customerId;
//   let paymentStatus = req.body.paymentStatus;
//  let clinical_uhid = await db.get_clinical_uhid(customerId);
//  let subscriptionStatus = 'NOT_SUBSCRIBED';
//  await db.update_subscription_details(subscriptionId, clinical_uhid,paymentStatus,subscriptionStatus);
//  const data = { type: 'Subscribed successfully' };
//      res.json(data);
//});

// app.listen() part should always be located in the last line of your code
app.listen(envVariables.APP_SERVER_PORT, () => {
    console.log('Zoho Books APP/Webhook is listening');
    readingSQSMsg();
})