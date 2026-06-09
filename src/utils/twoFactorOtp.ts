import { redis } from "../config/redis";


const TWO_FACTOR_BASE_URL =
"https://2factor.in/API/V1";


const OTP_SESSION_TTL_SECONDS = 600;



type TwoFactorResponse = {
  Status?: string;
  Details?: string;
};



const getApiKey = () =>
  process.env.TWO_FACTOR_API_KEY ||
  process.env.TWOFACTOR_API_KEY;



const normalizePhone = (value: unknown) =>
  String(value ?? "")
    .replace(/\D/g, "")
    .trim();



const readTwoFactorResponse = async (
  response: Response
) => {

const text =
await response.text();


try {

return JSON.parse(text)


} catch {


return {
 Status:
 response.ok
 ? "Success"
 : "Error",

 Details:text

};

}

};



// ================= SEND OTP =================


export const sendTwoFactorOtp =
async(
phoneValue: unknown
)=>{


const apiKey=getApiKey();


if(!apiKey){

throw new Error(
"TWO_FACTOR_API_KEY is not configured"
);

}



const phone =
normalizePhone(phoneValue);



if(phone.length!==10){

throw new Error(
"Enter a valid 10 digit mobile number"
);

}



const templateName =
process.env.TWO_FACTOR_OTP_TEMPLATE;



const parts=[
 TWO_FACTOR_BASE_URL,
 encodeURIComponent(apiKey),
 "SMS",
 phone,
 "AUTOGEN",
];



if(templateName){

parts.push(
encodeURIComponent(templateName)
);

}



const response =
await fetch(parts.join("/"));



const payload =
await readTwoFactorResponse(response);



if(
!response.ok ||
payload.Status !== "Success" ||
!payload.Details
){

throw new Error(
payload.Details ||
"Unable to send OTP"
);

}



await redis.set(

`otp:${payload.Details}`,

JSON.stringify({
 phone,
 verified:false
}),

"EX",

OTP_SESSION_TTL_SECONDS

);



return {
 phone,
 sessionId:payload.Details
};


};




// ================= VERIFY OTP =================



export const verifyTwoFactorOtp =
async(
sessionIdValue:unknown,
otpValue:unknown
)=>{


const apiKey=getApiKey();


if(!apiKey){

throw new Error(
"TWO_FACTOR_API_KEY is not configured"
);

}



const sessionId =
String(sessionIdValue ?? "")
.trim();



const otp =
String(otpValue ?? "")
.replace(/\D/g,"")
.trim();



if(!sessionId || otp.length < 4){

throw new Error(
"OTP and session id are required"
);

}




const response =
await fetch(

[
 TWO_FACTOR_BASE_URL,
 encodeURIComponent(apiKey),
 "SMS",
 "VERIFY",
 encodeURIComponent(sessionId),
 encodeURIComponent(otp)

].join("/")

);



const payload =
await readTwoFactorResponse(response);



if(
!response.ok ||
payload.Status !== "Success"
){

throw new Error(
payload.Details ||
"Invalid OTP"
);

}



const saved =
await redis.get(
`otp:${sessionId}`
);



if(saved){


const session =
JSON.parse(saved);



session.verified=true;



await redis.set(

`otp:${sessionId}`,

JSON.stringify(session),

"EX",

OTP_SESSION_TTL_SECONDS

);


}



return true;


};




// ================= CHECK SESSION =================



export const assertVerifiedOtpSession =
async(
sessionIdValue:unknown,
phoneValue:unknown
)=>{


const sessionId =
String(sessionIdValue ?? "")
.trim();



const phone =
normalizePhone(phoneValue);



const saved =
await redis.get(
`otp:${sessionId}`
);



if(!saved){

throw new Error(
"OTP expired please verify again"
);

}



const session =
JSON.parse(saved);



if(
!session.verified ||
session.phone !== phone
){

throw new Error(
"Please verify OTP before login"
);

}


};





// ================= DELETE AFTER LOGIN =================


export const consumeVerifiedOtpSession =
async(
sessionIdValue:unknown,
phoneValue:unknown
)=>{


await assertVerifiedOtpSession(
sessionIdValue,
phoneValue
);



const sessionId =
String(sessionIdValue ?? "")
.trim();



await redis.del(
`otp:${sessionId}`
);


};