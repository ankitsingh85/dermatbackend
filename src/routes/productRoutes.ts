import express, { Request, Response } from "express";
import upload from "../middleware/uploads";
import Product from "../models/Products";

const router = express.Router();


const textOnlyRegex = /^[A-Za-z ]+$/;


/* ================= URL VALIDATION ================= */

const isValidUrl = (value: unknown) => {

  if (!value) return true;

  if (typeof value !== "string") return false;


  try {

    const parsed = new URL(value.trim());

    return (
      parsed.protocol === "http:" ||
      parsed.protocol === "https:"
    );

  } catch {

    return false;

  }

};


/* ================= CLEAN TEXT ================= */

const stripHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();



/* ================= ARRAY PARSER ================= */

const parseJsonArray = (
value:unknown
):string[]|undefined=>{


if(Array.isArray(value)){

return value.map(String);

}


if(
typeof value !== "string" ||
!value.trim()
){

return undefined;

}



try{


const parsed =
JSON.parse(value);


if(Array.isArray(parsed)){

return parsed.map(String);

}


}

catch{


return value
.split(",")
.map(v=>v.trim())
.filter(Boolean);


}


return undefined;

};





/* ================= FILE PATH ================= */


const getUploadedPaths =
(files?:Express.Multer.File[])=>{


if(!files || !files.length)
return [];


return files.map(
file=>`/uploads/${file.filename}`
);


};





/* ================= NUMBERS ================= */


const normalizeNumericFields =
(payload:Record<string,unknown>)=>{


[
"mrpPrice",
"discountedPrice",
"discountPercent",
"taxPercent"

].forEach(field=>{


if(payload[field] !== undefined){

payload[field] =
Number(payload[field]);

}


});


};






/* ================= NORMALIZE PAYLOAD ================= */


const normalizeProductPayload = (

req:Request,

files?:{
[fieldname:string]:
Express.Multer.File[]
}

)=>{


const payload:
Record<string,unknown> =
{
...req.body
};





/* CATEGORY ARRAY */


const categories =
parseJsonArray(
payload.category
);


if(categories){

payload.category =
categories;

}




/* IMAGE */


const uploadedImages =
getUploadedPaths(
files?.productImages
);


const bodyImages =
parseJsonArray(
payload.productImages
);



if(uploadedImages.length){

payload.productImages =
uploadedImages;

}

else if(bodyImages){

payload.productImages =
bodyImages;

}





normalizeNumericFields(payload);



return payload;


};







/* ================= FIELD NAMES ================= */


const friendlyFieldNames:
Record<string,string> =
{

productName:"Product name",

category:"Category",

brandName:"Brand name",

description:"Description",

ingredients:"Ingredients",

targetConcerns:"Target concerns",

usageInstructions:"Usage instructions",

expiryDate:"Expiry date",

manufacturerName:"Manufacturer name",
licenseNumber:"License / FSSAI Number",

hsnCode:"HSN Code",

packagingType:"Packaging type",

skinHairType:"Skin / Hair type",

barcode:"Barcode",

netQuantity:"Net quantity",

quantityUnit:"Quantity unit",

mrpPrice:"MRP price",

discountedPrice:"Discounted price",

discountPercent:"Discount percent",

taxPercent:"Tax percent",

productImages:"Product images",

productShortVideo:"Product video"

};







/* ================= VALIDATION ================= */


const validateProductPayload =
(
payload:Record<string,unknown>,

isCreate=false

)=>{



/* CATEGORY CHECK */


if(
isCreate &&
(
!Array.isArray(payload.category)
||
payload.category.length===0
)
){

return {
message:"At least one category required"
};

}






const requiredFields = [

"productName",

"brandName",

"description",

"ingredients",

"targetConcerns",

"usageInstructions",

"expiryDate",
"manufacturerName",

"licenseNumber",

"hsnCode",

"packagingType",

"skinHairType",

"barcode",

"netQuantity",

"quantityUnit"

];




for(const field of requiredFields){


if(
isCreate &&
!stripHtml(payload[field])
){

return {

message:
`${friendlyFieldNames[field]} is required`

};


}


}







/* TEXT VALIDATIONS */


if(
payload.productName &&
!textOnlyRegex.test(
stripHtml(payload.productName)
)
){

return {
message:
"Product name letters only"
};

}





if(
payload.brandName &&
!textOnlyRegex.test(
stripHtml(payload.brandName)
)
){

return {
message:
"Brand name letters only"
};

}






// if(
// payload.licenseNumber &&
// !/^\d+$/.test(
// stripHtml(payload.licenseNumber)
// )
// ){

// return {
// message:
// "License number digits only"
// };

// }





if(
payload.productShortVideo &&
!isValidUrl(
payload.productShortVideo
)
){

return {
message:
"Invalid video URL"
};

}







/* IMAGE REQUIRED */


if(
isCreate &&
(
!payload.productImages ||
!Array.isArray(payload.productImages) ||
!payload.productImages.length
)
){

return {

message:
"At least one product image required"

};

}








/* NUMBER VALIDATION */


[
"mrpPrice",
"discountedPrice",
"discountPercent",
"taxPercent"

].forEach(()=>{});



return null;


};








const generateProductSKU = async()=>{

const now = new Date();

const year = now.getFullYear();

const month = String(
now.getMonth()+1
).padStart(2,"0");


const prefix =
`B2CProd-${year}${month}`;


const lastProduct =
await Product.findOne({

productSKU:{
$regex:`^${prefix}-`
}

})
.sort({
createdAt:-1
});



let nextNumber = 1;


if(lastProduct){

const lastNumber =
Number(
lastProduct.productSKU
.split("-")
.pop()
);


if(!isNaN(lastNumber)){

nextNumber =
lastNumber + 1;

}

}


return `${prefix}-${nextNumber}`;

};

/* ================= CREATE ================= */


router.post(
"/",

upload.fields([
{
name:"productImages",
maxCount:10
}
]),


async(
req:Request,
res:Response
)=>{


try{


const payload =
normalizeProductPayload(
req,

req.files as any
);




payload.productSKU =
await generateProductSKU();



const error =
validateProductPayload(
payload,
true
);


if(error)

return res
.status(400)
.json(error);





const product =
await Product.create(
payload
);



res
.status(201)
.json(product);



}


catch(err:any){


console.log(err);


res.status(500).json({

message:err.message

});


}



}

);







/* ================= GET ALL ================= */


router.get(
"/",

async(_req,res)=>{


const products =
await Product.find()
.sort({
createdAt:-1
});


res.json(products);


}

);






/* ================= GET ONE ================= */


router.get(
"/:id",

async(req,res)=>{


const product =
await Product.findById(
req.params.id
);



if(!product)

return res
.status(404)
.json({
message:"Not found"
});



res.json(product);


}

);








/* ================= UPDATE ================= */


router.put(
"/:id",

upload.fields([
{
name:"productImages",
maxCount:10
}
]),


async(req,res)=>{


try{


const payload =
normalizeProductPayload(
req,
req.files as any
);




const error =
validateProductPayload(
payload,
false
);



if(error)

return res
.status(400)
.json(error);





const product =
await Product.findByIdAndUpdate(

req.params.id,

payload,

{
new:true,
runValidators:true
}

);




if(!product)

return res
.status(404)
.json({
message:"Product not found"
});




res.json(product);


}


catch(err:any){


res.status(500)
.json({
message:err.message
});


}


}

);









/* ================= DELETE ================= */


router.delete(
"/:id",

async(req,res)=>{


await Product.findByIdAndDelete(
req.params.id
);


res.json({

message:"Deleted"

});


}

);








/* ================= REVIEW ================= */


router.post(
"/:id/reviews",

async(req,res)=>{


const product =
await Product.findById(
req.params.id
);



if(!product)

return res
.status(404)
.json({
message:"Not found"
});




product.reviews.push(
req.body
);



product.rating =

product.reviews.reduce(
(a,r)=>a+r.rating,
0
)

/ product.reviews.length;




await product.save();



res.json(product);



}

);



export default router;