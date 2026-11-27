const {test}=require('node:test');
const assert=require('node:assert/strict');
const {SnakeWinter}=require('../snake-winter.js');
function recording(){
  const calls=[];
  const ctx=new Proxy({}, {get(target,name){if(name in target)return target[name];if(name==='createLinearGradient')return ()=>({addColorStop(){}});return (...args)=>calls.push([name,...args]);},set(target,name,value){target[name]=value;return true;}});
  return {ctx,calls};
}
test('hollow tree artwork is cached across animation frames and invalidates on resize',()=>{
  const screen=recording(),buffer=recording();let surfaces=0;
  const painter=SnakeWinter.createPainter(()=>{surfaces++;return {getContext:()=>buffer.ctx};});
  painter.drawTree(screen.ctx,{x:100,y:160,cell:30,pixelRatio:1.5});
  const work=buffer.calls.length;
  painter.drawTree(screen.ctx,{x:300,y:200,cell:30,pixelRatio:1.5});
  assert.equal(surfaces,1);assert.equal(buffer.calls.length,work);
  assert.equal(screen.calls.filter(c=>c[0]==='drawImage').length,2);
  painter.drawTree(screen.ctx,{x:100,y:160,cell:20,pixelRatio:1.5});
  assert.equal(surfaces,2);
});
test('light snowfall stays bounded, is deterministic, and respects reduced motion',()=>{
  const a=recording(),b=recording();
  SnakeWinter.drawSnow(a.ctx,{width:1200,height:800,time:1234});
  SnakeWinter.drawSnow(b.ctx,{width:1200,height:800,time:1234});
  assert.deepEqual(a.calls,b.calls);
  const flakes=a.calls.filter(c=>c[0]==='arc');assert.equal(flakes.length,36);
  assert.ok(flakes.every(([,x,y,r])=>x>=0&&x<=1200&&y>=0&&y<=800&&r<=1.4));
  const mobile=recording();SnakeWinter.drawSnow(mobile.ctx,{width:320,height:568});
  assert.equal(mobile.calls.filter(c=>c[0]==='arc').length,20);
  const reduced=recording();SnakeWinter.drawSnow(reduced.ctx,{width:320,height:568,animate:false});
  assert.equal(reduced.calls.length,0);
});
test('tree, entrance mask and snow never consume gameplay randomness or leak canvas saves',()=>{
  const {ctx,calls}=recording(),original=Math.random;
  Math.random=()=>{throw Error('Rendering must not consume RNG');};
  try{
    SnakeWinter.createPainter(()=>null).drawTree(ctx,{x:100,y:160,cell:30});
    SnakeWinter.drawEntrance(ctx,{x:100,y:160,cell:30});
    SnakeWinter.drawSnow(ctx,{width:640,height:480,time:2000});
  }finally{Math.random=original;}
  assert.equal(calls.filter(c=>c[0]==='save').length,calls.filter(c=>c[0]==='restore').length);
});
