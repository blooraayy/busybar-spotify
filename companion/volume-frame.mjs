// Render the entire indicator on the PC; the device updates a single bitmap.
const ICONS = {
  "mute": [
    "        ",
    "  #     ",
    "### # # ",
    "###  #  ",
    "### # # ",
    "  #     ",
    "        ",
    "        "
  ],
  "50": [
    "        ",
    "  # #   ",
    "### .#  ",
    "###  #  ",
    "###  #  ",
    "..# #.  ",
    "  . .   ",
    "        "
  ],
  "100": [
    "    #   ",
    "  # .#  ",
    "### #.# ",
    "### # # ",
    "### # # ",
    "..# .#. ",
    "  . #.  ",
    "    .   "
  ]
};
const GLYPHS = {
  "0": [
    "01110",
    "10001",
    "10011",
    "10101",
    "11001",
    "10001",
    "01110"
  ],
  "1": [
    "00100",
    "01100",
    "00100",
    "00100",
    "00100",
    "00100",
    "01110"
  ],
  "2": [
    "01110",
    "10001",
    "00001",
    "00010",
    "00100",
    "01000",
    "11111"
  ],
  "3": [
    "11110",
    "00001",
    "00001",
    "01110",
    "00001",
    "00001",
    "11110"
  ],
  "4": [
    "00010",
    "00110",
    "01010",
    "10010",
    "11111",
    "00010",
    "00010"
  ],
  "5": [
    "11111",
    "10000",
    "10000",
    "11110",
    "00001",
    "00001",
    "11110"
  ],
  "6": [
    "01110",
    "10000",
    "10000",
    "11110",
    "10001",
    "10001",
    "01110"
  ],
  "7": [
    "11111",
    "00001",
    "00010",
    "00100",
    "01000",
    "01000",
    "01000"
  ],
  "8": [
    "01110",
    "10001",
    "10001",
    "01110",
    "10001",
    "10001",
    "01110"
  ],
  "9": [
    "01110",
    "10001",
    "10001",
    "01111",
    "00001",
    "00001",
    "01110"
  ],
  "%": [
    "11001",
    "11010",
    "00100",
    "00100",
    "01000",
    "10110",
    "00110"
  ],
  "<": [
    "00010",
    "00100",
    "01000",
    "10000",
    "01000",
    "00100",
    "00010"
  ],
  ">": [
    "01000",
    "00100",
    "00010",
    "00001",
    "00010",
    "00100",
    "01000"
  ]
};
export function volumeFrame(value) {
  if (!Number.isInteger(value) || value < 0 || value > 100) throw new Error('Invalid volume');
  const symbols='ABCDEFGHIJKLMNOP';
  const lines=['! XPM2','72 16 19 1','. c #000000','W c #FFFFFF','Z c #808080'];
  for(let i=0;i<16;i++) {
    const rgb=[16+Math.round(6*i/15),66+Math.round(97*i/15),36+Math.round(38*i/15)];
    lines.push(`${symbols[i]} c #${rgb.map(c=>c.toString(16).padStart(2,'0')).join('')}`);
  }
  const width=Math.round(72*value/100);
  const grid=Array.from({length:16},()=>Array.from({length:72},(_,x)=>x<width?symbols[Math.round(15*x/Math.max(1,width-1))]:'.'));
  const icon=ICONS[value===0?'mute':value===100?'100':'50'];
  for(let y=0;y<8;y++)for(let x=0;x<8;x++) {
    if(icon[y][x]!==' ')grid[y+4][x+1]=icon[y][x]==='#'?'W':'.';
  }
  const text=`< ${value}% >`;
  let left=72-(text.length*6-1)-1;
  for(const char of text) {
    const glyph=GLYPHS[char];
    if(glyph)for(let y=0;y<7;y++)for(let x=0;x<5;x++)if(glyph[y][x]==='1')
      grid[y+4][left+x]=(char==='<'&&value===0)||(char==='>'&&value===100)?'Z':'W';
    left+=6;
  }
  return [...lines,...grid.map(row=>row.join(''))].join('\n');
}
