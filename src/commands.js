export const EVENT_COMMAND = {
  name: "event",
  description: "Post an RSVP message with buttons",
  options: [
    {
      type: 3, // STRING
      name: "title",
      description: "Event title",
      required: true
    }
  ]
};
