import {Event} from "../models/event.js";


async function getPublicEvents(limit){
    const events = await Event
        .find()        
        .select("datetime description state chef membersLimit members")
        .sort({"_id": -1})
        .populate("chef", "name");
    if(limit) await events.limit(limit);
    const publicEvents = [];
    for (let event of events) {
        publicEvents.push(
            {
                _id: event.id,
                datetime: event.datetime,
                title: event.title,
                description: event.description,
                state: event.state,
                chef: event.chef ? event.chef.name : null,
                memberLimit: event.memberLimit,
                members: event.members.length,
            }
        );
    }
    return publicEvents;
}


async function getEvents(limit){
    if (limit){
        return await Event.find().sort({"datetime": -1, ":id": 1}).limit(limit);
    } else{
        return await Event.find();
    }
}


export {getPublicEvents, getEvents};
