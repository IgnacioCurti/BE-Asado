import mongoose from "mongoose";
import dotenv from "dotenv";
import express from "express";
import router from "./router/index.js";
import login from "./router/login.js";
import users from "./router/users.js";
import events from "./router/events.js";
import images from "./router/images.js";
import transferReceipt from "./router/transferReceipts.js";
import purchaseReceipt from "./router/purchaseReceipts.js";
import recoverPassword from "./router/recoverPassword.js";
import cors from 'cors';


mongoose.set('strictQuery', true);

dotenv.config();


const app = express();

const PORT = process.env.PORT || 3600;

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(
            process.env.DATABASE_URL,
            { useNewUrlParser: true, useUnifiedTopology: true }
        );
        console.log(`Connected to Database`);
    } catch (error) {
        console.log(error);
        process.exit(1);
    }
}

app.use(cors({
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    origin: '*',
}))
.use(express.json())
.use(express.urlencoded({ extended: true, limit: "200mb" }))
.use('/', router)
.use('/users', users)
.use('/login', login)
.use('/events', events)
.use('/images', images)
.use('/transferReceipts', transferReceipt)
.use('/purchaseReceipts', purchaseReceipt)
.use('/password', recoverPassword)

connectDB().then(() => {
    app.listen(PORT, () => {
        console.log("Server running");
    })
})
