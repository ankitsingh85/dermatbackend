import express from "express";
import ProductReview from "../models/productReview";


const router = express.Router();



/* CREATE REVIEW */

router.post("/", async(req,res)=>{

try{

const {
 productId,
 name,
 rating,
 comment
}=req.body;



if(
 !productId ||
 !name ||
 !rating ||
 !comment
){

return res.status(400).json({
 message:"All fields required"
});

}




const review =
await ProductReview.create({

 productId,
 name,
 rating,
 comment,

});



res.status(201).json({

message:"Review added",

review,

});



}catch(error){

res.status(500).json({

message:"Review failed",

});

}

});






/* GET PRODUCT REVIEWS */


router.get("/:productId",async(req,res)=>{

try{


const reviews =
await ProductReview.find({

productId:req.params.productId

})
.sort({
createdAt:-1
});



res.json(reviews);



}catch(error){


res.status(500).json({

message:"Failed loading reviews"

});


}


});




export default router;