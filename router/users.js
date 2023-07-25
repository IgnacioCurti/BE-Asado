import {Router} from "express";
import {User} from "../models/user.js";
import {auth} from "../middleware/auth.js"
import bcrypt from "bcrypt";


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
            res.status(404).send("The user with the given ID was not found.");
            return;
        } else {
            res.send(user);
        }
    } catch(e){
        res.status(500).send(e.message);
    }
});


router.post("/register", async (req, res) => {
    try{
        const existingUser = await User.findOne({email: req.body.email});
        if (existingUser) {
            return res.status(400).send('User already registered')
        }
        let user = new User(req.body);
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(user.password, salt);
        user = await user.save();
        res.status(201).send(user);
    } catch(e) {
        res.status(500).send(e.message);
    }
});


router.put("/editUser/:id", auth, async (req, res) => {
    try{
        const user = await User.findById(req.params.id);
        if (!user){
            return res.status(404).send("The user with the given ID was not found.");
        }

        user.name = req.body.name
        user.profilePicture = req.body.profilePicture
        user.specialDiet = req.body.specialDiet
        user.alias = req.body.alias
        user.cbu = req.body.cbu

        user.save()

        res.send(user);
    } catch(e){
        res.status(500).send(e.message)
    }
});


router.delete('/deleteUser/:id', auth, async (req, res) => {
    try{
        const user = await User.findByIdAndRemove(req.params.id);
        if (!user){
            res.status(404).send('The user with the given ID was not found.');
            return;
        }
        res.send(user);
    } catch(e){
        res.status(500).send(e.message);
    }
});


export default router;
