
import {Slots} from "./slots";
import FakeTimers from '@sinonjs/fake-timers';

//////////////////////////////////////////////////////////////////////////////////////////
// This is the library that Jest uses, but we can't use the builtin Jest functions
// because they don't support async/await.
const clock = FakeTimers.install();

async function delay(ms: number) {
   return new Promise<void>(r => {
      setTimeout(() => {
         r();
      }, ms);
   });
}

//////////////////////////////////////////////////////////////////////////////////////////
describe('push tests', () => {

   test('multiple pushes fire once each', async () => {
      
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      Slots.start("foo", "push", 20000, handler1);
      Slots.start("bar", "push", 20000, handler2);
      Slots.start("foo", "push", 20000, handler1);
      Slots.start("bar", "push", 20000, handler2);
      Slots.start("foo", "push", 20000, handler1);
      Slots.start("bar", "push", 20000, handler2);

      await clock.tickAsync(1000);
      expect(handler1).toBeCalledTimes(0);
      expect(handler2).toBeCalledTimes(0);

      await clock.tickAsync(21000);
      expect(handler1).toBeCalledTimes(1);
      expect(handler2).toBeCalledTimes(1);
      Slots.start("foo", "push", 20000, handler1);
      Slots.start("bar", "push", 20000, handler2);
      expect(handler1).toBeCalledTimes(1);
      expect(handler2).toBeCalledTimes(1);
      await clock.tickAsync(21000);
      expect(handler1).toBeCalledTimes(2);
      expect(handler2).toBeCalledTimes(2);
   });

   test('executions must not overlap', async() => {
      const handler1 = jest.fn(async () => delay(3000));
      const handler2 = jest.fn(async () => delay(3000));
      const handler3 = jest.fn(async () => delay(3000));
      const handler4 = jest.fn(async () => delay(3000));
      const handler5 = jest.fn(async () => delay(3000));
      //           1............................     3..............
      // --------- --------- --------- --------- --------- --------- 
      // ^ start 1 @0
      //           ^ exec 1 @1.0
      //                     ^ start 2 (and extra dummies 3,4) @2.0
      //                               ^ exec 2  @3.0
      //                                   ^ start 5 (cancels exec 2) @ 3.5
      //                                             ^ exec 5 @ 4.5
      Slots.start("foo", "push", 1000, handler1);
      
      await clock.tickAsync(2000);
      expect(handler1).toBeCalled();
      Slots.start("foo", "push", 1000, handler2);
      Slots.start("foo", "push", 1000, handler3);
      Slots.start("foo", "push", 1000, handler4);
      await clock.tickAsync(1500);
      Slots.start("foo", "push", 1000, handler5);
      await clock.tickAsync(500);
      expect(handler5).not.toBeCalled();
      
      await clock.tickAsync(20000);
      expect(handler5).toBeCalled();
      expect(handler2).not.toBeCalled();
      expect(handler3).not.toBeCalled();
      expect(handler4).not.toBeCalled();
   });

   test('push delays indefinitely when chained', async() => {
      const handler = jest.fn();
      for (let i = 0; i < 50; i++) {
         Slots.start("foo", "push", 1000, handler);
         Slots.start("foo", "ignore", 1000, handler);
         await clock.tickAsync(500);
         expect(handler).not.toBeCalled();
      }
      await clock.tickAsync(1500);
      expect(handler).toBeCalled();
   });
   
   test('push does not yield when period is 0', async() => {
      const handler = jest.fn(() => undefined);
      Slots.start("foo", "push", 0, handler);
      Slots.start("foo", "push", 0, handler);
      Slots.start("foo", "push", 0, handler);
      expect(handler).toBeCalledTimes(3);
   });

});

//////////////////////////////////////////////////////////////////////////////////////////
describe('ignore tests', () => {
   
   test('ignore should cancel additional slots until it is fully executed', async() => {
      const handler = jest.fn(async() => delay(3000));
      Slots.start("foo", "ignore", 1000, handler);
      Slots.start("foo", "ignore", 1000, handler);
      Slots.start("foo", "ignore", 1000, handler);
      await clock.tickAsync(1500);
      expect(handler).toBeCalledTimes(1);

      // These are ignored, during the execution period.
      Slots.start("foo", "ignore", 1000, handler);
      Slots.start("foo", "ignore", 1000, handler);
      Slots.start("foo", "ignore", 1000, handler);
      await clock.tickAsync(5000);
      expect(handler).toBeCalledTimes(1);

      Slots.start("foo", "ignore", 1000, handler);
      Slots.start("foo", "ignore", 1000, handler);
      Slots.start("foo", "ignore", 1000, handler);
      await clock.tickAsync(5000);
      expect(handler).toBeCalledTimes(2);

   });

   test('push during ignore applies delay', async() => {
      const handler = jest.fn(async() => delay(3000));
      Slots.start("foo", "ignore", 1000, handler);
      await clock.tickAsync(500);
      Slots.start("foo", "push", 2000, handler);
      await clock.tickAsync(1000);
      expect(handler).toBeCalledTimes(0);
      await clock.tickAsync(2500);
      expect(handler).toBeCalledTimes(1);

      await clock.tickAsync(10000);
      expect(handler).toBeCalledTimes(1);
   });

   test('ignore after push is ignored', async() => {
      const handler = jest.fn(async() => delay(3000));
      Slots.start("foo", "push", 1000, handler);
      await clock.tickAsync(500);
      Slots.start("foo", "ignore", 2000, handler);
      expect(handler).toBeCalledTimes(0);
      await clock.tickAsync(1000);
      expect(handler).toBeCalledTimes(1);
      await clock.tickAsync(2000);
      expect(handler).toBeCalledTimes(1);

      await clock.tickAsync(10000);
      expect(handler).toBeCalledTimes(1);
   });
   
   test('ignore with 0 period should not yield', async() => {
      const handler = jest.fn();
      Slots.start("foo", "ignore", 0, handler);
      Slots.start("foo", "ignore", 0, handler);
      Slots.start("foo", "ignore", 0, handler);
      expect(handler).toBeCalledTimes(3);

   });
});

//////////////////////////////////////////////////////////////////////////////////////////
describe('cooldown tests', () => {
   
   test('cooldown fires twice when run three times', async() => {

      // Delay after previous tests.
      await clock.tickAsync(10000);

      const handler = jest.fn();
      Slots.start("foo", "cooldown", 1000, handler);
      expect(handler).toBeCalledTimes(1);
      Slots.start("foo", "cooldown", 1000, handler);
      Slots.start("foo", "cooldown", 1000, handler);
      await clock.tickAsync(1500);
      expect(handler).toBeCalledTimes(2);

      // And then once more after the cooldown.
      Slots.start("foo", "cooldown", 1000, handler);
      Slots.start("foo", "cooldown", 1000, handler);
      await clock.tickAsync(750);
      expect(handler).toBeCalledTimes(3);
   });
});

//////////////////////////////////////////////////////////////////////////////////////////
describe('cancel tests', () => {
   
   test('cancels and cd checking', async() => {
      // Delay after previous tests.
      await clock.tickAsync(10000);

      const handler = jest.fn();

      // Should be not on CD when we start.
      expect(Slots.onCD("foo", 1000)).toBeFalsy();
      Slots.start("foo", "cooldown", 1000, handler);

      // On CD after instant-call.
      expect(Slots.onCD("foo", 1000)).toBeTruthy();
      expect(handler).toBeCalledTimes(1);

      Slots.start("foo", "cooldown", 1000, handler);

      // Still on CD
      expect(Slots.onCD("foo", 1000)).toBeTruthy();
      
      Slots.cancel("foo");

      // Still on CD after cancel.
      expect(Slots.onCD("foo", 1000)).toBeTruthy();

      await clock.tickAsync(1500);
      
      expect(handler).toBeCalledTimes(1);
      // Off CD after time passes.
      expect(Slots.onCD("foo", 1000)).toBeFalsy();
      
      Slots.start("foo", "push", 1000, handler);
      
      // No CD until the handler fires.
      expect(Slots.onCD("foo", 1000)).toBeFalsy();
      Slots.start("foo", "push", 0, handler); // This fires always.
      expect(Slots.onCD("foo", 1000)).toBeTruthy();

      Slots.cancel("foo"); // No-op.
      expect(Slots.onCD("foo", 1000)).toBeTruthy();

      Slots.start("foo", "push", 1000, handler);
      expect(Slots.onCD("foo", 1000)).toBeTruthy();

      Slots.cancel("foo");
      expect(Slots.onCD("foo", 1000)).toBeTruthy();

      await clock.tickAsync(1500);
      expect(Slots.onCD("foo", 1000)).toBeFalsy();
      expect(handler).toBeCalledTimes(2);

      Slots.start("foo", "ignore", 1000, handler);
      Slots.cancel("foo"); // No-op.
      expect(Slots.onCD("foo", 1000)).toBeFalsy();

      Slots.start("foo", "ignore", 1000, handler);
      await clock.tickAsync(1500);

      expect(Slots.onCD("foo", 1000)).toBeTruthy();
      expect(handler).toBeCalledTimes(3);
   });
});
