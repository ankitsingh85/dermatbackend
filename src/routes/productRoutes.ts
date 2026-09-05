import express, { Request, Response } from "express";
import fs from "fs";
import * as XLSX from "xlsx";
import { parseCsvRows } from "../utils/bulkUploadCsv";
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


if(payload[field] === undefined) return;

// Blank optional numeric field — drop it so it's treated as "not
// provided" instead of coercing "" to 0.
if(payload[field] === "" || payload[field] === null){

delete payload[field];

return;

}

payload[field] =
Number(payload[field]);


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






/* Only productName, category and discountedPrice are mandatory — every
   other field is optional and, if provided, is still format-checked
   below (but never required). */
const requiredFields = [

"productName"

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


/* DISCOUNTED PRICE CHECK */

if(
isCreate &&
(
payload.discountedPrice === undefined ||
payload.discountedPrice === null
)
){

return {
message:`${friendlyFieldNames.discountedPrice} is required`
};

}

if(
payload.discountedPrice !== undefined &&
Number.isNaN(Number(payload.discountedPrice))
){

return {
message:`${friendlyFieldNames.discountedPrice} must be a valid number`
};

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


/* ================= BULK CREATE ================= */

const normalizeHeader = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

// Parses a date-only string as UTC midnight, accepting both "YYYY-MM-DD"
// and "M/D/YYYY" (with or without leading zeros). Plain `new Date(string)`
// treats anything other than strict ISO "YYYY-MM-DD" as LOCAL midnight —
// on a positive-UTC-offset server (e.g. IST) that silently shifts the
// stored date back a day for "M/D/YYYY" input, so both accepted formats
// are parsed explicitly here instead of trusting the ambient timezone.
const parseDateOnly = (value: unknown): Date | undefined => {
  const str = String(value ?? "").trim();
  if (!str) return undefined;

  const iso = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const date = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  const mdy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const date = new Date(Date.UTC(Number(mdy[3]), Number(mdy[1]) - 1, Number(mdy[2])));
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  const fallback = new Date(str);
  return Number.isNaN(fallback.getTime()) ? undefined : fallback;
};

const getCell = (row: Record<string, unknown>, headers: string[]) => {
  for (const header of headers) {
    const foundKey = Object.keys(row).find((key) => normalizeHeader(key) === header);
    if (foundKey) {
      const raw = row[foundKey];
      // A cell XLSX parsed as a date (cellDates:true) comes back as a Date
      // object — stringify it as ISO rather than via Date#toString(), which
      // is locale/timezone-formatted text that isn't reliably re-parseable.
      if (raw instanceof Date) return raw.toISOString();
      return String(raw ?? "").trim();
    }
  }
  return "";
};

const setIfPresent = (payload: Record<string, unknown>, key: string, value: string) => {
  if (value) payload[key] = value;
};

const parseBoolCell = (value: string) =>
  ["true", "yes", "y", "1", "in stock", "active"].includes(value.trim().toLowerCase());

const readProductRows = (filePath: string) => {
  if (filePath.toLowerCase().endsWith(".csv")) {
    return parseCsvRows(fs.readFileSync(filePath));
  }
  // cellDates:true — converts a genuine Excel date-serial cell into a JS
  // Date instead of a raw serial number.
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], {
    defval: "",
  });
};

router.post("/bulk-upload", upload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "CSV or Excel file required" });
    }

    const ext = req.file.originalname.split(".").pop()?.toLowerCase();
    if (!ext || !["csv", "xls", "xlsx"].includes(ext)) {
      fs.unlink(req.file.path, () => undefined);
      return res.status(400).json({ message: "Only CSV, XLS, or XLSX files are allowed" });
    }

    const rows = readProductRows(req.file.path);
    fs.unlink(req.file.path, () => undefined);

    if (!rows.length) {
      return res.status(400).json({ message: "No rows found in uploaded file" });
    }

    const skipped: { row: number; reason: string }[] = [];
    const created: unknown[] = [];

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const rowNumber = index + 2;

      const payload: Record<string, unknown> = {
        productName: getCell(row, ["productname", "name"]),
      };

      const categoryRaw = getCell(row, [
        "category",
        "categories",
        "categoryname",
        "productcategory",
        "productcategories",
      ]);
      payload.category = categoryRaw
        ? categoryRaw.split(",").map((c) => c.trim()).filter(Boolean)
        : [];

      payload.discountedPrice = getCell(row, ["discountedprice", "price", "sellingprice"]);
      payload.mrpPrice = getCell(row, ["mrpprice", "mrp"]);
      payload.discountPercent = getCell(row, ["discountpercent", "discount"]);
      payload.taxPercent = getCell(row, ["taxpercent", "gst", "tax"]);

      setIfPresent(payload, "brandName", getCell(row, ["brandname", "brand"]));
      setIfPresent(payload, "description", getCell(row, ["description"]));
      setIfPresent(payload, "ingredients", getCell(row, ["ingredients"]));
      setIfPresent(payload, "targetConcerns", getCell(row, ["targetconcerns", "concerns"]));
      setIfPresent(
        payload,
        "usageInstructions",
        getCell(row, ["usageinstructions", "usage"])
      );
      setIfPresent(payload, "benefits", getCell(row, ["benefits"]));
      setIfPresent(payload, "certifications", getCell(row, ["certifications"]));
      setIfPresent(payload, "netQuantity", getCell(row, ["netquantity", "quantity"]));
      setIfPresent(payload, "quantityUnit", getCell(row, ["quantityunit", "unit"]));
      setIfPresent(payload, "hsnCode", getCell(row, ["hsncode", "hsn"]));
      const expiryDateRaw = getCell(row, ["expirydate", "expiry"]);
      if (expiryDateRaw) {
        const parsedExpiry = parseDateOnly(expiryDateRaw);
        if (parsedExpiry) payload.expiryDate = parsedExpiry;
      }
      setIfPresent(
        payload,
        "manufacturerName",
        getCell(row, ["manufacturername", "manufacturer"])
      );
      setIfPresent(
        payload,
        "licenseNumber",
        getCell(row, ["licensenumber", "license", "fssai"])
      );
      setIfPresent(payload, "packagingType", getCell(row, ["packagingtype", "packaging"]));
      setIfPresent(
        payload,
        "productShortVideo",
        getCell(row, ["productshortvideo", "videourl", "video"])
      );
      setIfPresent(payload, "skinHairType", getCell(row, ["skinhairtype", "skintype"]));
      setIfPresent(payload, "barcode", getCell(row, ["barcode", "sku"]));
      setIfPresent(payload, "gender", getCell(row, ["gender"]));

      const stockStatusRaw = getCell(row, ["stockstatus", "instock"]);
      if (stockStatusRaw) {
        payload.stockStatus = parseBoolCell(stockStatusRaw) ? "In Stock" : "Out of Stock";
      }

      const activeStatusRaw = getCell(row, ["activestatus", "active"]);
      if (activeStatusRaw) payload.activeStatus = parseBoolCell(activeStatusRaw);

      const dermRecommendedRaw = getCell(row, [
        "dermatologistrecommended",
        "dermrecommended",
      ]);
      if (dermRecommendedRaw) payload.dermatologistRecommended = parseBoolCell(dermRecommendedRaw);

      const imagesRaw = getCell(row, ["productimages", "images", "imageurl"]);
      if (imagesRaw) {
        payload.productImages = imagesRaw.split(",").map((v) => v.trim()).filter(Boolean);
      }

      normalizeNumericFields(payload);

      const validationError = validateProductPayload(payload, true);
      if (validationError) {
        skipped.push({ row: rowNumber, reason: validationError.message });
        continue;
      }

      try {
        payload.productSKU = await generateProductSKU();
        const product = await Product.create(payload);
        created.push(product);
      } catch (err: any) {
        skipped.push({ row: rowNumber, reason: err.message || "Failed to create product" });
      }
    }

    if (!created.length) {
      return res.status(400).json({
        message: "No valid products found in uploaded file",
        skipped,
      });
    }

    res.status(201).json({
      message: `${created.length} products uploaded successfully`,
      createdCount: created.length,
      skipped,
    });
  } catch (err: any) {
    if (req.file?.path) fs.unlink(req.file.path, () => undefined);
    res.status(400).json({ message: err.message || "Bulk upload failed" });
  }
});


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