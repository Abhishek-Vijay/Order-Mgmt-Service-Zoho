// uuid import 
const { v4: uuidv4 } = require('uuid');
var log4js = require('log4js');
var logger = log4js.getLogger();
logger.level = "debug";

const UUIDGenerator = () =>{
    // uuid generation 
    let new_uuid = uuidv4();
    logger.info('Your UUID is: ' + new_uuid);
    return new_uuid;
}

module.exports = { UUIDGenerator };