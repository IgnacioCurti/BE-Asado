import {verify} from 'jsonwebtoken';
import dotenv from "dotenv";

dotenv.config();

const jwtPrivateKey = process.env.JWTPRIVATEKEY;

function auth(req, res, next){
    const token = req.header("Authorization");
    if (!token) return res.status(401).send("Access denied. No token provided.");

    try{
        const decoded = verify(token, jwtPrivateKey);
        req.user = decoded;
        next();
    } catch(error) {
        res.status(400).send('Invalid token.');
    }
}


export {auth as auth};
