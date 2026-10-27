import mongoose from "mongoose";

mongoose.set("strictQuery", true);

export async function connectDB() {
  try {
    await mongoose.connect(process.env.DATABASE_URL);
    console.log(`Connected to MongoDB`);
  } catch (error) {
    console.error("Could not connect to MongoDB:", error);
    // Without a connection every query would hang until Mongoose's buffer
    // timeout, so stop instead of serving requests that can't succeed.
    throw error;
  }
}
