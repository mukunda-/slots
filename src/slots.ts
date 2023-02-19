/*****************************************************************************************
 * slots.ts
 *
 * Copyright 2023 Mukunda Johnson <mukunda@mukunda.com>
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the “Software”), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify,
 * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to the following
 * conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies
 * or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF
 * CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR
 * THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 ****************************************************************************************/

//////////////////////////////////////////////////////////////////////////////////////////
type Millis = number;

type SlotContext = {
   cancel?: boolean,
};

type SlotInfo = {
   // Context is created for each timer started.
   context: SlotContext,

   // The last time a timer expired.
   lastTriggered?: number,
   
   // Tracks current execution state. Only one execution can happen at once on a given
   // slot.
   executing?: Promise<void>;
};

type SlotHandler = (context: SlotContext) => void | Promise<void>;

const MySlots: Record<string, SlotInfo> = {};

//----------------------------------------------------------------------------------------
// Get slot info or create it if it doesn't exist.
function getOrCreateSlotInfo(slot: string) {
   let slotInfo = MySlots[slot];
   if (!slotInfo) {
      slotInfo = {
         context: {
            cancel: true
         },
      };
      slotInfo.context.cancel = true;
      MySlots[slot] = slotInfo;
   }
   return slotInfo;
}

//----------------------------------------------------------------------------------------
function timeNow() {
   return (new Date().getTime());
}

//----------------------------------------------------------------------------------------
// Returns true if the time since this slot last fired is greater than
//  `period` seconds.
//
function onCD(slot: string, period: Millis) {
   const slotInfo = getOrCreateSlotInfo(slot);
   const timeToNext = (slotInfo.lastTriggered ?? -period) + period - timeNow();
   return !(timeToNext <= 0);
}

//----------------------------------------------------------------------------------------
// Start a new execution slot.
// slot: Unique ID for this slot.
// mode: How this slot works or reacts to additional start calls.
// period: Milliseconds until the slot triggers. If 0, the slot will execute in the same
//         execution path instantly (if not busy).
// handler: Function to execute.
//
// Here are the different start modes:

// "push" [default]
// Cancel existing slot. If you're using the same period and function, you're "pushing"
// its execution back until the new period expires. This might also make it faster if your
// new period is shorter. This is useful for delaying serverside queries until the user is
// finished inputting something.
//
// For example, if the user is typing a string in a search box, you can start a push slot
// for each keystroke. Then, only when they stop typing for a short period will the query
// trigger -- and not for every keystroke.

// "ignore"
// If there is an active slot on a slot, any new calls using that slot will be ignored.
// This is for when you want a slot that is executed after a period but not with further
// delays. In other words, useful for throttling requests with a start delay.

// "cooldown"
// This is like ignore, but it allows triggering instantly if the last call wasn't done
// within the period specified. Otherwise, it's "on cooldown", and the slot behaves like
// "ignore" and the trigger time is fixed to last_trigger_time + period.
//
// In other words, it only allows execution of a function every `period` seconds, and if
// it's "on cooldown", it schedules a call for when the cooldown expires.
//
// The callback will fire from this execution path (inside `start`) when not on cooldown.

// When a slot is triggered, another slot cannot be triggered until the execution
// finishes. The handler will receive the context, and they can check the "cancel" field
// to exit early if they want.
async function start(slot: string,
               mode: "push"|"ignore"|"cooldown",
               period: Millis,
               handler: SlotHandler) {
   
   const slotInfo = getOrCreateSlotInfo(slot);
   
   // This is the only data we need to expose to the outside, and we capture
   // it inside our anonymous callback.
   const context: SlotContext = {};

   if (mode == "cooldown") {
      // For cooldown, it works the same as ignore with a period ranging from 0 to the
      // cooldown time.

      // Time until the cooldown expires.
      const timeToNext = (slotInfo.lastTriggered ?? -period) + period - timeNow();

      period = Math.max(timeToNext, 0);
      if (timeToNext <= 0) {
         // No cooldown, we can trigger instantly.
         period = 0;
      } else {
         period = timeToNext;
      }      

      // Continue in "ignore" mode. It will either be scheduled or wait until the existing
      // finishes.
      mode = "ignore";
   }
   
   if (mode == "push") {
      // Cancel existing execution for "push".
      slotInfo.context.cancel = true;
   } else { // "ignore"/default
      if (!slotInfo.context.cancel) return;
   }
   
   // Save the current context. This can be overwritten by the next call.
   slotInfo.context = context;

   if (period != 0) {
      await new Promise<void>(r => {
         setTimeout(() => {
            r();
         }, period);
      });
   }

   if (context.cancel) return; // We've been canceled.

   // When we are ready to trigger, first, wait for any active execution on this slot to
   // complete entirely. This can delay further executions indefinitely if it doesn't
   // return.
   if (slotInfo.executing) await slotInfo.executing;

   // Note this is a little precarious since we can have multiple invocations waiting on
   // the above executing promise. However, only ONE instance should not have "cancel"
   // set at this point.
   
   // So, check if we have been canceled again here.
   if (context.cancel) return;

   slotInfo.lastTriggered = Math.max(slotInfo.lastTriggered ?? timeNow(), timeNow());

   const executing = handler(context);
   // Handler returns promise if it is an async handler.
   if (executing) {
      slotInfo.executing = executing;
      await slotInfo.executing;
      // Async execution handlers can also check "cancel" and exit early in case another
      // push timer starts on the slot.
      delete(slotInfo.executing);
   }

   // Mark as complete so further "ignore" handlers can run after this point.
   context.cancel = true;
}

//----------------------------------------------------------------------------------------
// Cancels an existing slot. `slot` is what was passed to `start`.
function cancel(slot: string) {
   const slotInfo = getOrCreateSlotInfo(slot);
   slotInfo.context.cancel = true;
}

export const Slots = {start, cancel, onCD};
//////////////////////////////////////////////////////////////////////////////////////////
