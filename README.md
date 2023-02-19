# slots
A basic execution throttling library with named slots.

    import {Slots} from "@mukunda/slots";

`push` mode cancels previous pending timer. For example, if a user is actively typing in a search query and each key press starts a `push` slot, then it will only call the search API when they are done typing.

    // Call callback after 500ms
    Slots.start("myslot", "push", 500, callback);
    
    sleep(300);

    // Cancels previous call and call it in another 500ms.
    Slots.start("myslot", "push", 500, callback);

`cooldown` mode fires instantly or after a certain cooldown period passes. For example, when a user clicks on a button once, they get instant results. If they click it several times, requests to the server are delayed and only sent after each cooldown period.

    function myClickHandler() {
        // If you click this button 5 times within 3 seconds,
        //  the callback will only trigger twice. Once on the
        //  first click, and again after the cooldown expires.

        // In other words, if the cooldown is "active", then
        //  the next execution is scheduled for when the
        //  cooldown expires.

        Slots.start("myslot", "cooldown", 3000, () => {
            // Perform expensive API call.
        }));
    }

`ignore` mode throws away new executions if one is currently scheduled.

    // Only triggers once after the first expires.
    Slots.start("myslot", "ignore", 500, callback);
    Slots.start("myslot", "ignore", 500, callback);
    Slots.start("myslot", "ignore", 500, callback);

Callbacks can be async functions. In that case, further executions are delayed further if a previous callback is still executing.

 * `ignore` will wait until the delay plus the callback completes before further scheduling is allowed.
 * `push` triggers will delay longer if an execution is in progress. If another push happens during this additional delay, the previous push will be canceled.
 * `cooldown` triggers work like `ignore` when on cooldown.
 