// DO NOT EDIT! This test has been generated by /html/canvas/tools/gentest.py.
// OffscreenCanvas test in a worker:2d.composite.operation.get
// Description:
// Note:

importScripts("/resources/testharness.js");
importScripts("/html/canvas/resources/canvas-tests.js");

var t = async_test("");
var t_pass = t.done.bind(t);
var t_fail = t.step_func(function(reason) {
    throw reason;
});
t.step(function() {

var canvas = new OffscreenCanvas(100, 50);
var ctx = canvas.getContext('2d');

var modes = ['clear', 'source-atop', 'source-in', 'source-out',
    'source-over', 'destination-atop', 'destination-in', 'destination-out',
    'destination-over', 'lighter', 'copy', 'xor', 'multiply', 'screen',
    'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn',
    'hard-light', 'soft-light', 'difference', 'exclusion', 'hue',
    'saturation', 'color', 'luminosity'];
for (var i = 0; i < modes.length; ++i)
{
    ctx.globalCompositeOperation = modes[i];
    _assertSame(ctx.globalCompositeOperation, modes[i], "ctx.globalCompositeOperation", "modes[\""+(i)+"\"]");
}
t.done();

});
done();
