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
const { SQSClient, ReceiveMessageCommand } = require("@aws-sdk/client-sqs");
// Create SQS service object.
const sqsClient = new SQSClient({region: envVariables.REGION});

// S3 related imports
const { S3Client, PutObjectCommand} = require("@aws-sdk/client-s3");
// Create an Amazon S3 service client object.
const s3Client = new S3Client({ region: envVariables.REGION });

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
// const { UUIDGenerator } = require('./helper/generator');
const { SubscriptionNotification, InvoiceNotification } = require('./helper/Notification');

const app = express() // creates http server
const processInvoiceMessage = require('./processInvoice');
const processPersonMessage = require('./processPerson');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

let queueFlag = true;
// SQS Caller Function to get the queue 
const readingSQSMsg = async() =>{
    logger.debug("Middleware called");
    if(queueFlag){
        try {
            let command = new ReceiveMessageCommand(invoiceParams)
            const data = await sqsClient.send(command);
            if (data.Messages) {
                processInvoiceMessage(data.Messages[0])
            } else {
                logger.debug("No messages to delete in Invoice Queue");
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
                logger.debug("No messages to delete in Person Queue");
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
                    invoiceNumber: newobj.invoice_number,
                    invoiceUrl: newobj.invoice_url,
                    amount: newobj.amount,
                    createdAt: newobj.created_at?.toISOString().replace("T", " "),
                    paymentStatus: newobj.payment_status,
                    paymentDate: newobj.payment_date?.toISOString().replace("T", " ")
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
            id:item.product_id,
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
    logger.error('Error while retrieving the products:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

//API to list all the plans of a product available
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
    logger.error('Error while retrieving the plans:', error);
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

// Calling the API to get all the subscriptions for a User from Zoho Directly 
//  To-DO This code can only be added when customer_id available in DB
  let patientDetails = await db.get_customer_id(uuid).then(data=>data).catch(err=>{
              logger.error(err);
               return res.sendStatus(400);
  });

// const params = {
//   customer_id: `${patientDetails.customer_id}`
// };

const headers = {
  Authorization: `Zoho-oauthtoken ${token}`,
  'X-com-zoho-subscriptions-organizationid' : `${envVariables.ORGANIZATION_ID}`
 };

const customerDetails = await axios.get(`https://www.zohoapis.in/subscriptions/v1/customers?cf_uhid=${patientDetails.clinical_uhid}`, {headers: headers})
let customerDetailsResponse = JSON.parse(JSON.stringify(customerDetails.data));

const params = {
  customer_id: `${customerDetailsResponse.customers[0].customer_id}`
};

try {
    const response = await axios.get('https://www.zohoapis.in/subscriptions/v1/subscriptions', {
      params: params,
      headers: headers
    });
    const subscriptionInfo = [];
    let responseData = JSON.parse(JSON.stringify(response.data));
    // console.log(responseData.subscriptions);
    responseData.subscriptions?.forEach((item) => {
      const jsonObject = {
        planName: item.plan_name,
        name: item.name,
        code: item.plan_code,
        // description: item.description
      };
      // Push the generated JSON object into the array
      subscriptionInfo.push(jsonObject);
    });
    const jsonWithRoot = {
      'subscriptionInfo': subscriptionInfo
    };
    console.log( responseData.subscriptions);
    res.statusCode = 200;
    res.json(jsonWithRoot);
// try {
//     let subscribed_plans = await db.get_user_subscription(uuid).then(data=>data).catch(err=>{
//       logger.error(err);
//        return res.sendStatus(400);
//     });
//     res.statusCode = 200;
//     res.json({'subscriptionInfo': subscribed_plans});
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
    // if(req.body.status){
    //     let processing_status;
    //     let payment_date = null;
    //     let invoice_url =  req.body.invoice_url?.replace("/secure","/securepay").trim();
    //     logger.info(JSON.stringify(req.body));
    //     if (req.body.status.toUpperCase() == 'PAID'){ 
    //       payment_date = new Date();
    //       invoice_url =  req.body.invoice_url;
    //       processing_status = 'PAYMENT_COMPLETED';}
    //     else if (req.body.status.toUpperCase() == 'FAILED') processing_status = 'PAYMENT_FAILED';
    //     else if (req.body.status.toUpperCase() == 'OVERDUE') processing_status = 'PAYMENT_OVERDUE';
    //     await db.Order_Update_Payment(req.body.invoice_number, processing_status, req.body.status.toUpperCase(), payment_date, invoice_url).then(data=>data).catch(err=>{
    //         logger.error(err);
    //         return;
    //     });
    //     await db.Order_Txn_Logs_Webhook_Update(req.body.invoice_number, processing_status);
    // }
    // // return a text response
    // const data = { type: 'Received' };
    // res.json(data);

  logger.debug('Request received to update Invoice details');
  logger.info("Received information in request body",JSON.stringify(req.body));
  let invoice_id = req.body.invoice_id;
  let clinical_uhid = req.body.customer_UHID;
  let invoice_number = req.body.invoice_number;
  let invoice_url =  req.body.invoice_url?.replace("/secure","/securepay").trim();
  let amount =  req.body.invoice_total;
  let payment_status = req.body.status?.toUpperCase() === 'SENT' ? "DUE" : req.body.status?.toUpperCase() === 'PAID' ? "PAID" : "FAILED"
  let customer_name =  req.body.customer_name;
  let invoice_type = 'LAB_ORDER';

  try{
    // Step 6 - Get Invoice in pdf format and save it to amazon S3 bucket
    let access_token = await tokens.accessToken(clinical_uhid); 
    let config = {
        headers:{
            Authorization: `Zoho-oauthtoken ${access_token}`,
            'content-type': 'application/json',
            'responseType': 'arraybuffer'
        },
        retry: 3
    }
    // let new_config = config;
    // new_config['responseType'] = 'arraybuffer'
    let invoice_in_pdf = await axios.get(`https://www.zohoapis.in/books/v3/invoices/${invoice_id}?organization_id=${envVariables.ORGANIZATION_ID}&accept=pdf`,config)
    .then(res=>{
        // logger.info(res.data," patient uhid: ",clinical_uhid)
        return res.data;
    }).catch(err=>{
        logger.error("Getting invoice in pdf format error, " + err.response.data.message +" patient uhid: ",clinical_uhid)
        // throw new Error("Getting invoice in pdf format error, " + err.response.data.message);
    })

    // TODO : need to get encounterId from UC_ORDER table.
    let encounterId = await db.get_encounter_id(invoice_number);
    // Set the parameters for S3 Bucket
    const params = {
        Bucket: `${envVariables.S3_BUCKET}`, // The name of the bucket. For example, 'sample-bucket-101'.
        Key: `${envVariables.DEPLOYMENT_ENV}/${envVariables.S3_FOLDER}/${clinical_uhid}/${encounterId}/${invoice_number}.pdf`, // The name of the object. For example, 'sample_upload.txt'.
        Body: invoice_in_pdf, // The content of the object. For example, 'Hello world!".
    };

    let s3_bucket_url;
    try {
        const results = await s3Client.send(new PutObjectCommand(params));
        logger.info("Successfully created " + params.Key + " and uploaded it to " + params.Bucket + "/" + params.Key);
        // return results; // For unit tests.
        s3_bucket_url = `https://${envVariables.S3_BUCKET}.s3.${envVariables.REGION}.amazonaws.com/${envVariables.DEPLOYMENT_ENV}/${envVariables.S3_FOLDER}/${clinical_uhid}/${encounterId}/${invoice_number}.pdf`
      } catch (err) {
        logger.error("Error while uploading invoice pdf in S3 Bucket: ", err);
    }
  //  Inserting or Updating invoice record in UC_INVOICE
  invoice_url = payment_status === 'PAID' ? req.body.invoice_url : invoice_url;
  if(clinical_uhid == "") throw new Error("Clinical_UHID should not be empty, Hence not processing this request.");
  await db.insert_update_invoice(invoice_id, clinical_uhid, invoice_number, invoice_url, amount, payment_status, invoice_type, s3_bucket_url); 
  let processing_status;
  if (payment_status == 'PAID') processing_status = 'PAYMENT_COMPLETED';
  else if (payment_status == 'FAILED') processing_status = 'PAYMENT_FAILED';
  else if (payment_status == 'DUE') processing_status = 'PAYMENT_OVERDUE';
  await db.Order_Txn_Logs_Webhook_Update(invoice_number, processing_status);
  
  let patientId = await db.get_patient_uuid(clinical_uhid);
  InvoiceNotification(clinical_uhid,patientId,customer_name,invoice_type,payment_status,amount);

    const data = { type: 'Lab order successfull' };
    res.json(data);
  }catch (err){
    logger.error("paymentHook Error", err);
  }
});

app.post('/subscriptionHook', async(req, res) => {
 logger.debug('Request received to update subscription details');
  logger.info("Received information in request body",JSON.stringify(req.body));
  try{
  let subscriptionId = req.body.subscriptionId;
  let customerId = req.body.customerId;
  let planCode = req.body.planCode;
//   let customerUHID = await db.get_clinical_uhid(customerId);
  let customerUHID = req.body.customerUHID;
  let paymentStatus = 'PAID';
  let subscriptionStatus = 'SUBSCRIBED';
  let customerName = req.body.customerName;
  let start_date = req.body.start_date;
  let end_date = req.body.end_date;
  // updation code for subscription < commented because throwing error since start_date column is not present in the Dev table >
  // await db.update_subscription_details(subscriptionId, customerUHID,paymentStatus,subscriptionStatus,planCode,start_date,end_date);

  let patientId = await db.get_patient_uuid(customerUHID);
//   getting plan_name from Database
  let planName = await db.get_plan_name(planCode).then(res=>{
    return res;
  }).catch(err=>{
    logger("plan name retreival Error", err)
  }); 

  SubscriptionNotification(customerUHID,patientId,customerName,planName);

  const data = { type: 'Subscribed successfully' };
      res.send(data);
    }catch (error){
      console.error('Error while updating the subscription for a patient: <this error can be ignored for now since subscriptionHook webhook flow is not required>', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/subscriptionPaymentHook', async(req, res) => {
  logger.debug('Request received to update subscription details');
  logger.info("Received information in request body",JSON.stringify(req.body));
  let invoice_id = req.body.invoice_id;
  let clinical_uhid = req.body.customer_UHID;
  let invoice_number = req.body.invoice_number;
  let invoice_url =  req.body.invoice_url?.replace("/secure","/securepay").trim();
  let amount =  req.body.invoice_total;
  let payment_status = req.body.invoice_status?.toUpperCase() === 'SENT' ? "DUE" : req.body.invoice_status?.toUpperCase() === 'PAID' ? "PAID" : "FAILED"
  let product_id = req.body.product_id;
  let customer_name =  req.body.customer_name;
  let invoice_type = 'SUBSCRIPTION';

  try{
  // Step 6 - Get Invoice in pdf format and save it to amazon S3 bucket
  let access_token = await tokens.accessToken(clinical_uhid); 
  let config = {
      headers:{
          Authorization: `Zoho-oauthtoken ${access_token}`,
          'content-type': 'application/json',
          'responseType': 'arraybuffer'
      },
      retry: 3
  }
  // let new_config = config;
  // new_config['responseType'] = 'arraybuffer'
  let invoice_in_pdf = await axios.get(`https://www.zohoapis.in/books/v3/invoices/${invoice_id}?organization_id=${envVariables.ORGANIZATION_ID}&accept=pdf`,config)
  .then(res=>{
      // logger.info(res.data," patient uhid: ",clinical_uhid)
      return res.data;
  }).catch(err=>{
      logger.error("Getting invoice in pdf format error, " + err.response.data.message +" patient uhid: ",clinical_uhid)
      // throw new Error("Getting invoice in pdf format error, " + err.response.data.message);
  })

  // Set the parameters for S3 Bucket
  const params = {
      Bucket: `${envVariables.S3_BUCKET}`, // The name of the bucket. For example, 'sample-bucket-101'.
      Key: `${envVariables.DEPLOYMENT_ENV}/${envVariables.S3_FOLDER}/${clinical_uhid}/Subscriptions/${invoice_number}.pdf`, // The name of the object. For example, 'sample_upload.txt'.
      Body: invoice_in_pdf, // The content of the object. For example, 'Hello world!".
  };

  let s3_bucket_url;
  try {
      const results = await s3Client.send(new PutObjectCommand(params));
      logger.info("Successfully created " + params.Key + " and uploaded it to " + params.Bucket + "/" + params.Key);
      // return results; // For unit tests.
      s3_bucket_url = `https://${envVariables.S3_BUCKET}.s3.${envVariables.REGION}.amazonaws.com/${envVariables.DEPLOYMENT_ENV}/${envVariables.S3_FOLDER}/${clinical_uhid}/Subscriptions/${invoice_number}.pdf`
    } catch (err) {
      logger.error("Error while uploading invoice pdf in S3 Bucket: ", err);
    }
    
  //  Inserting or Updating invoice record in UC_INVOICE
  invoice_url = payment_status === 'PAID' ? req.body.invoice_url : invoice_url;
  if(clinical_uhid == "") throw new Error("Clinical_UHID should not be empty, Hence not processing this request.");
  await db.insert_update_invoice(invoice_id, clinical_uhid, invoice_number, invoice_url, amount, payment_status, invoice_type, s3_bucket_url);

  let patientId = await db.get_patient_uuid(clinical_uhid);
  //  getting product_name from Database
  let productName = await db.get_product_name(product_id).then(res=>{
    return res;
  }).catch(err=>{
    logger("plan name retreival Error", err)
  }); 

  // let token = await tokens.get_billing_access_token();
  const headers = {
    Authorization: `Zoho-oauthtoken ${access_token}`,
    'X-com-zoho-subscriptions-organizationid' : `${envVariables.ORGANIZATION_ID}`
  };

  const invoiceResponse = await axios.get(`https://www.zohoapis.in/subscriptions/v1/invoices/${invoice_id}`,{headers})
  let responseData = JSON.parse(JSON.stringify(invoiceResponse.data));
  let planName = responseData.invoice.invoice_items[0].name;
  // console.log(responseData.invoice.invoice_items[0].description.split('(')[1].split(')')[0]);

  if(payment_status === "PAID") SubscriptionNotification(clinical_uhid,patientId,customer_name,planName,productName);
  else if(payment_status === "DUE") InvoiceNotification(clinical_uhid,patientId,customer_name,invoice_type,payment_status,"",planName,productName);

    const data = { type: 'Subscribed successfully' };
    res.json(data);
  }catch (err){
    logger.error("subscriptionPaymentHook Error", err);
  }

});

// app.listen() part should always be located in the last line of your code
app.listen(envVariables.APP_SERVER_PORT, () => {
    console.log('Zoho Books APP/Webhook is listening');
    readingSQSMsg();
})
