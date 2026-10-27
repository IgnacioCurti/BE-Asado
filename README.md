# BE-Asado

Express.js REST API for Food-Spot


## Date convention

All dates are Argentina local time (UTC-3, no DST) stored as if they were UTC: an event at 21:00 in Buenos Aires is saved as `21:00Z`, and clients display the stored value without converting it.

On the backend, compare against "now" with `nowArgentina()` (`src/utils/dates.ts`), and build wall-clock times (for example, the 20:00 penalization reminder) with the UTC setters, so results don't depend on the server's time zone.


## Endpoints documentation

References: 

 - (body argument) = Optional
 - [body argument] = Array
 - {values} = the argument only admits values inside curly brackets


| Prefix | Endpoint | Description | Type | Parameters | Auth | Body requirements | Response |
|--|--|--|--|--|--|--|--|
| events | getEvents | Gets all events in the database | GET |  | Yes |  | [Event] |
| events | getPublicEvents | Gets all non private events with public data only sorted by date of creation in descendent order | GET |  | No |  | [Event] (does not return organizer, members is just the amount of members, chef is just the chef name), ratings is an object with avgScore(Number) and ratingsAmount(Number) |
| events | getPublicAndPrivateEvents | Gets all public events and all private events that include the user with public data only sorted by date of creation in descendent order | GET |  | Yes |  | [Event] (does not return organizer, members is just the amount of members, chef is just the chef name), ratings is an object with avgScore(Number) and ratingsAmount(Number) |
| events | getEventById/:id | Gets an event by its id (12 byte Object ID) | GET | id | Yes |  | Event |
| events | getMembersAndReceiptsInfo/:event | Returns a list of users and their transferReceipt information | GET | event | Yes |  | [{userId(ObjectId), userName(String), userLastName(String), specialDiet(String), transferReceipt(ObjectId or null), hasReceiptApproved(Boolean), hasUploaded(Boolean)}] |
| events | getMemberIndividualCost/:user/:event | Gets a user's cost by event | GET | user, event | Yes |  | number |
| events | createEvent | Creates an event | POST |  | Yes | <ul> <li>title: String</li> <li>description: String</li> <li>datetime: Date</li> <li>memberLimit: Number (Integer)</li> <li>members: [ObjectId of a member]</li> <li>organizer: ObjectId of a member</li> <li>(chef: ObjectId of a member)</li> <li>(shoppingDesignee: ObjectId of a member)</li><li>isPrivate: Boolean</li><li>penalization: Number</li><li>penalizationStartDate: Date</li></ul> | Event |
| events | getMembersAmount/:event | Returns a list of users, with the amount to pay and the receiver of that payment | GET | event | Yes |  |
| events | subscribeToAnEvent/:id/:event | Subscribes a user by id for a certain event providing the event's id (12 byte Object ID) | PUT | id, event | Yes and user token needs to be the user to subscribe |  |
| events | unsubscribeFromEvent/:id/:event | Removes a user by id for a certain event providing the event's id (12 byte Object ID) | PUT | id, event | Yes and user token needs to be the user to remove |  |
| events | editRoles/:id | Edits an event's chef and shopping designee by its id (12 byte Object ID) | PUT | id | Yes | <ul><li>chef: ObjectId of a member</li> <li>shoppingDesignee: ObjectId of a member</li> </ul> |
| events | editEvent/:id | Edits an event by its id (12 byte Object ID) | PUT | id | Yes and user token needs to be the organizer's | <ul><li>title: String</li><li>description: String<li>datetime: Date</li> <li>memberLimit: Number (Integer)</li> <li>isPrivate: Boolean</li> <li>state: String with limited values {closed, available, readyforpayment, cancelled, finished}</li> <li>penalization: Number</li><li>penalizationStartDate: Date</li></ul> |
| events | deleteEvent/:id | Deletes an event by its id (12 byte Object ID) | DELETE | id | Yes and user token needs to be the organizer's |  |
| images | getImage/:id | Gets an image by its id (12 byte Object ID) | GET | id | Yes |  |
| - | login | Logs a user and returns the auth token | POST |  | No | <ul><li>email: String</li> <li>password: String</li></ul> |
| options | getMembersWhoHaventVoted/:event | Returns the count of event members who haven't voted for any option | GET | event | Yes |  | count: Number |
| options | createOption/:event | Creates a new option for an event | POST |  | Yes | <ul><li>title: String</li><li>participants: [ObjectId]</li></ul> | Option |
| options | editOption/:id | Edits an option by its id | PUT | id | Yes | <ul><li>title: String</li><li>participants: [ObjectId]</li></ul> | Option |
| options | deleteOption/:id | Deletes an option by its id and removes it from the event | DELETE | id | Yes |  | Option |
| purchaseReceipts | getPurchaseReceiptsByEvent/:event | Gets all purchaseReceipts from an event providing the event's id (12 byte Object ID) | GET | event | Yes and user token needs to be an event member |  |
| purchaseReceipts | getPurchaseReceiptById/:id/:event | Gets a single purchaseReceipt by id for a certain event providing the event's id (12 byte Object ID)  | GET | id, event | Yes and user token needs to be an event member |  |
| purchaseReceipts | createPurchaseReceipt/:event | Creates a purchaseReceipt for a certain event | POST | event | Yes and user token needs to be the shoppingDesignee's | <ul><li>description: String</li> <li>amount: Number</li></ul> |
| purchaseReceipts | assignMembersToReceipt | Assigns members to purchaseReceipts given its id (12 byte Object ID) | PUT | id | Yes| <ul><li>receipt: Array of custom objects with "id" (purchaseReceipt id) and "participants" (Array of participants id)</li></ul> 
| purchaseReceipts | uploadFile/:purchaseReceipt | Uploads a file for a purchaseReceipt | POST | purchaseReceipt | Yes | file: png/jpeg/pdf |
| purchaseReceipts | deletePurchaseReceipt/:id/:event | Deletes a purchaseReceipt by id (12 byte Object ID) | DELETE | id | Yes and user token needs to be the shoppingDesignee's |  |
| password | forgot | Updates verification code for password recovery and sends the recovery email | POST |  | No | <ul><li>email: String</li></ul> |
| password | verifyCode | Verifies if the code for password recovery is correct | PUT |  | No | <ul><li>verificationCode: String</li> <li>email: String</li></ul> |
| password | recover | Changes user's password providing the correct verification code | PUT |  | No | <ul><li>email: String</li> <li>verificationCode: String</li> <li>password: String</li></ul> |
| ratings | getRatingFromUser/:event/:user | Gets the rating made by a user for a certain event | GET | event, user | Yes |  |
| ratings | createRating/:event/:user | Creates (or modifies if it's been created already) a rating made by a user for a certain event | POST | event, user | Yes | score: Integer with limited values {1, 2, 3, 4, 5} |, 
| transferReceipts | getTransferReceiptsByEvent/:event | Gets all transferReceipts from an event providing the event's id (12 byte Object ID) | GET | event | Yes |  |
| transferReceipts | getTransferReceiptsById/:id | Gets a single transferReceipt by its id (12 byte Object ID) | GET | id | Yes |  |
| transferReceipts | uploadFile/:transferReceipt | Uploads a file for a transferReceipt | POST | transferReceipt | Yes | file: png/jpeg/pdf |
| transferReceipts | createTransferReceipt/:event | Creates a transferReceipt for a certain event | POST | event | Yes | <ul><li>(description: String)</li> <li>amount: Number</li> <li>user: ObjectId of a member</li> <li>(paymentMethod: String)</li> <li>DON'T SEND hasPaid: Boolean or send it as false</li></ul> |
| transferReceipts | approvePaymentWithoutReceipt/:event/:user | Creates and approves a transferReceipt for a certain event for a user that hasn't uploaded a receipt yet | POST | event | Yes |  |
| transferReceipts | approveTransferReceipt/:id/:event | Approves a single transferReceipt by its id (12 byte Object ID) | PUT | id, event | Yes and user token needs to be the shoppingDesignee |  |
| transferReceipts | deleteTransferReceipt/:id | Deletes a transferReceipt by its id (12 byte Object ID) | DELETE | id | Yes and user token needs to be the receipt owner |  |
| users | getUsers  | Gets all users in the database | GET |  | Yes |  |
| users | getUserById/:id | Gets a user by its id (12 byte Object ID) | GET | id | Yes |  |
| users | isDebtor/:id  | If a user hasn't paid an event it will return said event. If not it will return null | GET | id | Yes |  |
| users | hasPendingTransfers/:id | Returns the events where a user has pending transfer receipts to approve | GET | id | Yes |  | [ObjectId]
| users | register | Creates a user | POST |  | No | <ul><li>name: String</li> <li>lastName: String</li> <li>email: String</li> <li>password: String</li> <li>profilePicture: String</li> <li>[specialDiet: String with limited values {celiac, hypertensive, vegan, vegetarian}]</li> <li>(cbu: String)</li> <li>(alias: String)</li></ul> |
| users | editProfilePicture/:id | Modifies a user's profile picture | PUT | id | Yes and user token needs to be the user to change | <ul><li>file: png/jpeg</ul></li> |
| users | editUser/:id | Edits a user by its id (12 byte Object ID) | PUT | id | Yes and user token needs to be the user to edit| <ul><li>name: String</li> <li>lastName: String</li> <li>profilePicture: String</li> <li>[specialDiet: String with limited values {celiac, hypertensive, vegan, vegetarian}]</li> <li>cbu: String</li> <li>alias: String</li> </ul> |
| users | deleteUser/:id | Deletes a user by id (12 byte Object ID) | DELETE | id | Yes and user token needs to be the user to delete |  |



## Document structure

### Event

- title: String, required: true
- datetime: Date, required: true
- description: String, required: true
- memberLimit: Number, required: true
- state: String, required: true, default: "available", must be one of
  – "closed"
  – "available"
  – "readyforpayment"
  – "cancelled"
  – "finished"
- members: [ObjectId], ref: "User"
- chef: ObjectId, ref: "User", default: null
- organizer: ObjectId, ref: "User", required: true
- shoppingDesignee: [ObjectId], ref: "User", default: null
- transferReceipts: [ObjectId], ref: "TransferReceipt", default: []
- purchaseReceipts: [ObjectId], ref: "PurchaseReceipt", default: []
- ratings: [ObjectId], ref: "Rating"
- isPrivate: Boolean, default: false
- penalization: Number, default: null
- penalizationStartDate: Date


### Image

- name: String
- mimetype: String
- image: Buffer

### PurchaseReceipt

- image: ObjectId, ref: "Image", default: null
- description: String, required: true
- amount: Number, required: true
- event: ObjectId, ref: "Event", required: true
- shoppingDesignee: ObjectId, ref: "User", required: true
- participants: [ObjectId], ref: "User"

### Rating

- score: Number, required: true
- user: ObjectId, ref: "User"

### TransferReceipt

- image: ObjectId, ref: "Image", default: null
- description: String
- amount: Number, required: true
- hasPaid: Boolean, default: false
- paymentMethod: String, default: null
- user: ObjectId, ref: "User", required: true
- event: ObjectId, ref: "Event", required: true
- datetime: Date, required: true

### User

- name: String, required: true
- lastName: String
- email: String, required: true, unique: true
- alternativeEmail: String
- password: String, required: true
- verificationCode: String, default: null
- cbu: String, default: null
- alias: String, default: null
- specialDiet: [String], required: true
-   notifications: {
    newEvent: { type: Boolean, default: false },
    eventStart: { type: Boolean, default: false },
    penalizationStart: { type: Boolean, default: false },
    penalizationOneWeek: { type: Boolean, default: false },
  },
- profilePicture: ObjectId, ref: "Image", default: null
