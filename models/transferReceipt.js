import mongoose from "mongoose";


const transferReceiptSchema = new mongoose.Schema({

    image: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Image',
        default: null
    },

    description: {
        type: String,
        required: true
    },

    amount: {
        type: Number,
        required: true
    },

    hasPaid: {
        type: Boolean,
        default: false
    },

    paymentMethod: {
        type: String,
        default: null
    },

    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    event: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Event',
        required: true
    }
});


const TransferReceipt = mongoose.model('TransferReceipt', transferReceiptSchema);


export {transferReceiptSchema as transferReceiptSchema, TransferReceipt as TransferReceipt};
