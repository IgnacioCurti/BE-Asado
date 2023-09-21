import {Router} from "express";
import {TransferReceipt} from "../models/transferReceipt.js";
import {Event} from "../models/event.js";
import {auth} from "../middleware/auth.js";
import {transferReceiptOwner} from "../middleware/transferReceiptOwner.js";
import {shoppingDesignee} from "../middleware/shoppingDesignee.js";
import {multerUpload} from "../middleware/multerUpload.js";
import {saveImage} from "../services/images.service.js";


const router = Router();


router.get("/getTransferReceiptsByEvent/:event", [auth, shoppingDesignee], async (req, res)=> {
    try{
        const transferReceipts = await TransferReceipt.find();
        res.send(transferReceipts);
    } catch(e){
        res.status(500).send(e.message);
    }
});


router.get("/getTransferReceiptsById/:id", auth, async (req, res)=> {
    try{
        const transferReceipt = await TransferReceipt.findById(req.params.id);
        if (!transferReceipt) {
            return res.status(404).send("The transfer receipt with the given ID was not found.");
        } else {
            res.send(transferReceipt);
        }
    } catch(e){
        res.status(500).send(e.message);
    }
});


router.post("/createTransferReceipt/:event", [auth, multerUpload.single('file')], async (req, res)=> {
    try {
        const imageId = await saveImage(req.file);
        let transferReceipt = new TransferReceipt(req.body);
        transferReceipt.image = imageId;
        transferReceipt = await transferReceipt.save();
        const event = await Event.findById(req.params.event);
        event.transferReceipts.push(transferReceipt);
        await event.save();
        res.status(201).send(transferReceipt);
    } catch(e) {
        res.status(500).send(e.message);
    }
});


router.delete('/deleteTransferReceipt/:id', [auth, transferReceiptOwner], async (req, res) => {
    try{
        const transferReceipt = await TransferReceipt.findByIdAndRemove(req.params.id);
        if (!transferReceipt) return res.status(404).send('The transfer receipt with the given ID was not found.');
        const event = await Event.findById(req.params.event);
        const index = event.transferReceipts.indexOf(transferReceipt);
        event.transferReceipts.splice(index, 1);
        await event.save();
        res.send(transferReceipt);
    } catch(e){
        res.status(500).send(e.message);
    }
});


export default router;
