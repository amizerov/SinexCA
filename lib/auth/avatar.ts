import {inflateSync,deflateSync} from "node:zlib";
export const MAX_AVATAR_BYTES=400*1024;
const signature=Buffer.from([137,80,78,71,13,10,26,10]);
const crcTable=Array.from({length:256},(_,index)=>{let value=index;for(let bit=0;bit<8;bit++)value=value&1?0xedb88320^(value>>>1):value>>>1;return value>>>0;});
function crc(data:Buffer){let value=0xffffffff;for(const byte of data)value=crcTable[(value^byte)&255]^(value>>>8);return (value^0xffffffff)>>>0;}
function chunk(name:string,data:Buffer){const type=Buffer.from(name),length=Buffer.alloc(4),checksum=Buffer.alloc(4);length.writeUInt32BE(data.length);checksum.writeUInt32BE(crc(Buffer.concat([type,data])));return Buffer.concat([length,type,data,checksum]);}
/** Accept bounded browser-generated PNG pixels only; discard metadata and re-compress canonical chunks. */
export function normalizeAvatarPng(input:Buffer):Buffer{
  const fail=()=>{throw new Error("Некорректный PNG-аватар. Выберите изображение заново.");};
  if(input.length>MAX_AVATAR_BYTES||input.length<57||!input.subarray(0,8).equals(signature))return fail();
  let offset=8,header:Buffer|undefined,width=0,height=0,channels=0,ended=false,dataEnded=false;
  const compressed:Buffer[]=[];
  while(offset<input.length){
    if(offset+12>input.length)return fail();
    const length=input.readUInt32BE(offset),end=offset+12+length;if(end>input.length)return fail();
    const name=input.toString("ascii",offset+4,offset+8),data=input.subarray(offset+8,end-4);
    if(crc(input.subarray(offset+4,end-4))!==input.readUInt32BE(end-4))return fail();
    if(!header&&name!=="IHDR")return fail();
    if(name==="IHDR"){
      if(header||length!==13)return fail();header=Buffer.from(data);width=data.readUInt32BE(0);height=data.readUInt32BE(4);
      if(width<1||height<1||width>256||height>256||data[8]!==8||![2,6].includes(data[9])||data[10]!==0||data[11]!==0||data[12]!==0)return fail();
      channels=data[9]===6?4:3;
    }else if(name==="IDAT"){if(dataEnded)return fail();compressed.push(data);}
    else if(name==="IEND"){if(length||end!==input.length||!compressed.length)return fail();ended=true;offset=end;break;}
    else{if(!/^[a-zA-Z]{4}$/.test(name)||name[0]===name[0].toUpperCase()&&name!=="PLTE")return fail();if(compressed.length)dataEnded=true;}
    offset=end;
  }
  if(!ended||!header)return fail();
  const stride=1+width*channels,expected=stride*height;
  let pixels:Buffer;try{pixels=inflateSync(Buffer.concat(compressed),{maxOutputLength:expected});}catch{return fail();}
  if(pixels.length!==expected)return fail();
  for(let row=0;row<height;row++)if(pixels[row*stride]>4)return fail();
  return Buffer.concat([signature,chunk("IHDR",header),chunk("IDAT",deflateSync(pixels,{level:9})),chunk("IEND",Buffer.alloc(0))]);
}
