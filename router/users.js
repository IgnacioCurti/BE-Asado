import {Router} from "express";
import {User} from "../models/user.js";
import {auth} from "../middleware/auth.js"
import {sameUser} from "../middleware/sameUser.js"
import bcrypt from "bcrypt";
import {multerUpload} from "../middleware/multerUpload.js";
import {saveImage} from "../services/images.service.js";


const router = Router();


router.get("/getUsers", auth, async (req, res) => {
    try {
        const users = await User.find();
        res.send(users);
    } catch(e){
        res.status(500).send(e.message);
    }
});


router.get("/getUserById/:id", auth, async (req, res) => {
    try{
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).send("The user with the given ID was not found.");
        } else {
            res.send(user);
        }
    } catch(e){
        res.status(500).send(e.message);
    }
});


router.get("/isDebtor/:id", [auth, sameUser], async (req, res) => {
    const eventsWithoutReceipts = await Event.findOne({"members": req.params.id,
                                                    "transferReceipts.user": {
                                                        "$ne": req.params.id
                                                    }
    })
    if (eventsWithoutReceipts) return res.status(200).send({"eventId": eventsWithoutReceipts.id})
    const eventsNotPaid = await TransferReceipt.findOne({user: req.params.id,
                                                        hasPaid: false})
    if (eventsNotPaid) return res.status(200).send({"eventId": eventsNotPaid.event.id})
    res.status(200).send({"eventId": null})
})


router.post("/register", /*multerUpload.single('file'), */ async (req, res) => {
    try{
        
        const existingUser = await User.findOne({email: req.body.email});
        if (existingUser) return res.status(400).send('User already registered')
        // const imageId = await saveImage(req.file);
        let user = new User(req.body);
        // user.profilePicture = imageId;
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(user.password, salt);
        user = await user.save();
        res.status(201).send(user);
    } catch(e) {
        res.status(500).send(e.message);
    }
});


router.put("/editUser/:id", [auth, sameUser], async (req, res) => {
    try{
        let user = await User.findById(req.params.id);
        if (!user) return res.status(404).send("The user with the given ID was not found.");
        user.name = req.body.name ? req.body.name : user.name;
        user.profilePicture = req.body.profilePicture;
        user.specialDiet = req.body.specialDiet;
        user.alias = req.body.alias;
        user.cbu = req.body.cbu;
        user = await user.save();
        res.send(user);
    } catch(e){
        res.status(500).send(e.message)
    }
});


router.put("/editProfilePicture/:id", [auth, sameUser, multerUpload.single("file")], async (req, res) => {
    let user = await User.findById(req.params.id);
    if (!user) return res.status(404).send("The user with the given ID was not found.");
    const imageId = await saveImage(req.file);
    user.profilePicture = imageId;
    user = await user.save();
    res.status(200).send(user);
});


router.delete('/deleteUser/:id', [auth, sameUser] , async (req, res) => {
    try{
        const user = await User.findByIdAndRemove(req.params.id);
        if (!user) return res.status(404).send('The user with the given ID was not found.');
        res.send(user);
    } catch(e){
        res.status(500).send(e.message);
    }
});


export default router;
