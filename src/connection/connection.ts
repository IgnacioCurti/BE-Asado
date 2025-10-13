import mongoose from "mongoose";

mongoose.set("strictQuery", true);

export async function connectDB() {
  try {
    await mongoose.connect(process.env.DATABASE_URL as string);
    console.log(`Connected to MongoDB`);
  } catch (error) {
    console.log(error);
  }
}
