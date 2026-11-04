import mongoose from "mongoose";
import { IGroup } from "./interfaces.js";
import { isValidGroupCode } from "../modules/groups/groupCode.js";

// Límites de GROUPS_FEATURE.md §8. MAX_GROUPS_PER_USER se valida en el servicio
// (no es una propiedad de un solo documento).
export const GROUP_LIMITS = {
  NAME_MAX_LENGTH: 50,
  MAX_MEMBERS: 200,
  MAX_COVER_PHOTOS: 5,
  MAX_GROUPS_PER_USER: 100,
} as const;

function hasNoDuplicates(ids: mongoose.Types.ObjectId[]): boolean {
  return new Set(ids.map(String)).size === ids.length;
}

// La membresía vive solo acá (no se duplica en User) y los eventos apuntan al
// grupo con Event.group: el grupo no guarda events[] (§3.2).
// Estos validadores corren en save/validate. Los updates atómicos de los
// servicios ($addToSet, etc.) tienen que aplicar los límites en el filtro.
const groupSchema: mongoose.Schema<IGroup> = new mongoose.Schema<IGroup>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: GROUP_LIMITS.NAME_MAX_LENGTH,
    },

    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      validate: { validator: isValidGroupCode, message: "Invalid group code." },
    },

    // Siempre al menos uno, y todo admin es miembro.
    admins: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "User",
      default: [],
      validate: [
        {
          validator: (admins: mongoose.Types.ObjectId[]) => admins.length > 0,
          message: "A group needs at least one admin.",
        },
        { validator: hasNoDuplicates, message: "Duplicated admins." },
        {
          validator: function (this: IGroup, admins: mongoose.Types.ObjectId[]): boolean {
            const members: Set<string> = new Set(this.members.map(String));
            return admins.every((admin) => members.has(String(admin)));
          },
          message: "Every admin must be a member of the group.",
        },
      ],
    },

    // Índice para "mis grupos": Group.find({ members: userId }).
    members: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "User",
      default: [],
      index: true,
      validate: [
        {
          validator: (members: mongoose.Types.ObjectId[]) =>
            members.length <= GROUP_LIMITS.MAX_MEMBERS,
          message: `A group can have at most ${GROUP_LIMITS.MAX_MEMBERS} members.`,
        },
        { validator: hasNoDuplicates, message: "Duplicated members." },
      ],
    },

    // En el orden en que se subieron (§3.5).
    coverPhotos: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "Image",
      default: [],
      validate: {
        validator: (photos: mongoose.Types.ObjectId[]) =>
          photos.length <= GROUP_LIMITS.MAX_COVER_PHOTOS,
        message: `A group can have at most ${GROUP_LIMITS.MAX_COVER_PHOTOS} cover photos.`,
      },
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const Group: mongoose.Model<IGroup> = mongoose.model<IGroup>("Group", groupSchema);

export { Group };
