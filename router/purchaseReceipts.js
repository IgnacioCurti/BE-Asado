import {Router} from "express";
import {PurchaseReceipt} from "../models/purchaseReceipt.js";
import {Event} from "../models/event.js";
import {auth} from "../middleware/auth.js"
import {shoppingDesignee} from "../middleware/shoppingDesignee.js"
import {multerUpload} from "../middleware/multerUpload.js";
import {saveImage} from "../services/images.service.js";


const router = Router();


router.get("/getPurchaseReceiptsByEvent/:event", auth, async (req, res)=> {
    try{
        if(!req.params.event){
            return res.status(400).send("No event ID provided")
        }
        const event = await Event.findById(req.params.event).populate("purchaseReceipts");
        if(!event){
            return res.status(404).send("The event with the given ID was not found.")
        }
        return res.send(event.purchaseReceipts);
    } catch(e){
        return res.status(500).send(e.message);
    }
});


router.get("getPurchaseReceiptById/:id", auth, async (req, res)=> {
    try{
        const purchaseReceipt = await PurchaseReceipt.findById(req.params.id);
        if (!purchaseReceipt) {
            res.status(404).send("The purchase receipt with the given ID was not found.");
            return;
        } else {
            res.send(purchaseReceipt);
        }
    } catch(e){
        res.status(500).send(e.message);
    }
});


router.post("createPurchaseReceipt/:event", [auth, shoppingDesignee, multerUpload.single('file')], async (req, res)=> {
    try{
        const imageId = await saveImage(req.file)
        let purchaseReceipt = new PurchaseReceipt(req.body);
        purchaseReceipt.image = imageId
        purchaseReceipt = await purchaseReceipt.save();
        const event = await Event.findById(req.params.event);
        event.purchaseReceipts.push(purchaseReceipt)
        await event.save()
        res.status(201).send(purchaseReceipt);
    } catch(e){
        res.status(500).send(e.message);
    }
});


router.delete("deletePurchaseReceipt/:id/:event", [auth, shoppingDesignee], async (req, res) => {
    try {
        const purchaseReceipt = await PurchaseReceipt.findByIdAndDelete(req.params.id)
        if (!purchaseReceipt) {
            return res.status(404).send("The purchase receipt with the given ID was not found.")
        }
        const event = await Event.findById(req.params.event);
        const index = event.purchaseReceipts.indexOf(purchaseReceipt)
        event.purchaseReceipts.splice(index, 1)
        await event.save()
        res.send(purchaseReceipt)
    } catch (e) {
        res.status(500).send(e.message)
    }
})


export default router;
