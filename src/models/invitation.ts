import mongoose from "mongoose";
import { IInvitation } from "./interfaces.js";

// Invitaciones por mail con token propio (GROUPS_FEATURE.md §4.3, opción B).
// El link lleva el token en claro; acá se guarda solo su hash (sha256), así un
// dump de la base no permite aceptar invitaciones.
export const INVITATION_LIMITS = {
  TTL_MS: 7 * 24 * 60 * 60 * 1000,
  MAX_PENDING_PER_GROUP: 50,
} as const;

const invitationSchema: mongoose.Schema<IInvitation> = new mongoose.Schema<IInvitation>(
  {
    group: { type: mongoose.Schema.Types.ObjectId, ref: "Group", required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    status: { type: String, enum: ["pending", "accepted", "revoked"], default: "pending" },
    acceptedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    acceptedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Una sola invitación pendiente por mail y grupo: reinvitar la renueva.
invitationSchema.index(
  { group: 1, email: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } }
);

const Invitation: mongoose.Model<IInvitation> = mongoose.model<IInvitation>(
  "Invitation",
  invitationSchema
);

export { Invitation };
