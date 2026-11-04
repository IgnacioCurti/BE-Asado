import jwt from "jsonwebtoken";
import multer from "multer";
import { NextFunction } from "express";
import { isValidId } from "../core/validation/isValidId.js";
import { sendError } from "../core/http/sendError.js";
import { eventAccessPolicy as policy } from "../modules/events/index.js";
import { groupAccessPolicy } from "../modules/groups/index.js";
import { jwtPrivateKey } from "../config.js";
import { STATUS_CODES } from "../constants/httpStatusCode.js";
import { Request, Response } from "express";
import { IUserPayload, IRequestWithUser } from "../models/interfaces.js";

const invalidObjectIdMessage: string = "Invalid ObjectID";

const MIMETYPES: string[] = ["image/jpeg", "image/png", "application/pdf"];
const MIMETYPES_IMAGE: string[] = ["image/jpeg", "image/png"];
// Files are kept in memory and stored inside a Mongo document (16 MB max).
const MAX_FILE_SIZE: number = 5 * 1024 * 1024;

export function auth(req: IRequestWithUser, res: Response, next: NextFunction) {
  const token: string = req.header("Authorization");
  if (!token)
    return res
      .status(STATUS_CODES.UNAUTHORIZED)
      .json({ message: "Access denied. No token provided." });

  try {
    const decoded = jwt.verify(token, jwtPrivateKey) as IUserPayload;
    req.user = decoded;
    next();
  } catch (error: any) {
    return res.status(STATUS_CODES.BAD_REQUEST).json({ message: "Invalid token." });
  }
}

export const multerUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (MIMETYPES.includes(file.mimetype)) cb(null, true);
    else cb(new Error(`Only ${MIMETYPES.join(" - ")} mime types are allowed.`));
  },
  limits: { fieldSize: 10000000, fileSize: MAX_FILE_SIZE },
});

export const multerUploadImages = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (MIMETYPES_IMAGE.includes(file.mimetype)) cb(null, true);
    else
      cb(
        new Error(`Only ${MIMETYPES_IMAGE.join(" - ")} mime types are allowed.`)
      );
  },
  limits: {
    fieldSize: 10000000,
    fileSize: MAX_FILE_SIZE,
  },
});

export async function sameUser(req: IRequestWithUser, res: Response, next: NextFunction) {
  try {
    if (!isValidId(req.user._id) || !isValidId(req.params.id))
      return res
        .status(STATUS_CODES.BAD_REQUEST)
        .json({ message: invalidObjectIdMessage });
    if (req.params.id !== req.user._id)
      return res.status(STATUS_CODES.FORBIDDEN).json({
        message:
          "Access denied. User is trying to access other user's information.",
      });
    next();
  } catch (error: any) {
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ message: error?.message || "Internal server error" });
  }
}

type AccessCheck = (req: IRequestWithUser) => Promise<void>;

// Adapta una regla de EventAccessPolicy a middleware de Express: si la regla
// lanza, responde el error (400 / 403 / 404 / 500); si no, sigue.
function guard(check: AccessCheck) {
  return async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    try {
      await check(req);
    } catch (error) {
      return sendError(res, error);
    }
    next();
  };
}

export const eventOrganizer = guard((req) =>
  policy.assertOrganizer(req.params.id, req.user._id)
);

export const eventParticipant = guard((req) =>
  policy.assertMember(req.params.event, req.user._id)
);

// Estado de pagos y montos de un evento (:event).
export const eventViewer = guard((req) => policy.assertViewer(req.params.event, req.user._id));

export const shoppingDesignee = guard((req) =>
  policy.assertShoppingDesignee(req.params.event, req.user._id)
);

export const shoppingDesigneeOrEventOrganizer = guard((req) =>
  policy.assertOrganizerOrDesignee(req.params.id, req.user._id)
);

export const transferReceiptOwner = guard((req) =>
  policy.assertTransferReceiptOwner(req.params.id, req.user._id)
);

// Rutas de opciones: el evento sale de :event (crear) o de la opción en :id
// (editar/borrar). Solo su organizador o un designado puede gestionarlas.
export const optionManager = guard((req) =>
  policy.assertOptionManager(req.params.event, req.params.id, req.user._id)
);

// Votar: el usuario tiene que ser miembro del evento al que pertenece la opción.
export const optionVoter = guard((req) => policy.assertOptionVoter(req.params.id, req.user._id));

// Grupos (:group): miembro o admin del grupo (GROUPS_FEATURE.md §5.1).
export const groupMember = guard((req) =>
  groupAccessPolicy.assertMember(req.params.group, req.user._id)
);

export const groupAdmin = guard((req) =>
  groupAccessPolicy.assertAdmin(req.params.group, req.user._id)
);
