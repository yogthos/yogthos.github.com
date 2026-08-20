import { createHyphenator } from '../chunk-KQ5ZWCOR.js';

// src/hyphenation/fi.ts
var patterns = "1ba 1be 1bi 1bo 1bu 1by 1da 1de 1di 1do 1du 1dy 1d\xE4 1d\xF6 1fa 1fe 1fi 1fo 1fu 1fy 1ga 1ge 1gi 1go 1gu 1gy 1g\xE4 1g\xF6 1ha 1he 1hi 1ho 1hu 1hy 1h\xE4 1h\xF6 1ja 1je 1ji 1jo 1ju 1jy 1j\xE4 1j\xF6 1ka 1ke 1ki 1ko 1ku 1ky 1k\xE4 1k\xF6 1la 1le 1li 1lo 1lu 1ly 1l\xE4 1l\xF6 1ma 1me 1mi 1mo 1mu 1my 1m\xE4 1m\xF6 1na 1ne 1ni 1no 1nu 1ny 1n\xE4 1n\xF6 1pa 1pe 1pi 1po 1pu 1py 1p\xE4 1p\xF6 1ra 1re 1ri 1ro 1ru 1ry 1r\xE4 1r\xF6 1sa 1se 1si 1so 1su 1sy 1s\xE4 1s\xF6 1ta 1te 1ti 1to 1tu 1ty 1t\xE4 1t\xF6 1va 1ve 1vi 1vo 1vu 1vy 1v\xE4 1v\xF6 1st2r \xE42y y1a2 y1o2 o1y \xF62y u1y2 y1u2 \xF63a2 \xF63o2 \xE43a2 \xE43o2 \xE41u2 \xF61u2 a1\xE4 a1\xF6 o1\xE4 o1\xF6 u1\xE42 u1\xF62 \xE42\xE4 \xF62\xF6 \xE42\xF6 \xF62\xE4 aa1i2 aa1e2 aa1o2 aa1u2 ee1a2 ee1i2 ee1u2 ee1y2 ii1a2 ii1e2 ii1o2 uu1a2 uu1e2 uu1o2 uu1i2 e1aa i1aa o1aa u1aa u1ee a1uu i1uu e1uu o1uu \xE4\xE41i \xE4\xE41e \xE4\xE43y i1\xE4\xE4 e1\xE4\xE4 y1\xE4\xE4 i1\xF6\xF6 a1ei a1oi e1ai i1au y1ei ai1a ai1e ai1o ai1u au1a au1e eu1a ie1a ie1o ie1y io1a2 io1e2 iu1a iu1e iu1o oi1a oi1e oi1o oi1u o1ui ou1e ou1o ue1a ui1e uo1a uo1u e1\xF62 \xF61e2 .\xE42 u2s yli1o2p ali1a2v 1sp2li alous1 keus1 rtaus1 2s1ohje 2s1a2sia 1a2sian 1a2siat 1a2sioi r2as l2as 2s1o2pisk 2n1o2pet 2s1a2loi 2n1o2pist 2s1o2pist 2s1o2sa 2n1o2sa alkei2s1 perus1 2s1i2dea. 2s1i2dean 2s1e2sity 2n1e2dus 2s1ajatu 2s1ase 2s1apu 2s1y2rit .ydi2n1 .suu2r1a2 2s1y2hti 2n1otto 2n1oton 2n1anto 2n1anno 2n1a2jan 2n1aika 2n1o2mai 2n1y2lit 2s1a2len 2n1a2len 1a2siaka2s1 ulo2s1 2n1a2jo 2s1a2jo b2l 1b2lo bib3li b2r 1b2ri 1b2ro 1b2ru d2r 1d2ra f2l 1f2la f2r 1f2ra 1f2re g2l 1g2lo g2r 1g2ra k2l 1k2ra 1k2re 1k2ri 1k2v 1k2va p2l p2r 1p2ro c2l q2v 1q2vi sc2h ts2h ch2r";
var exceptions = "";
var hyphenateFi = createHyphenator({
  patterns,
  exceptions,
  leftmin: 2,
  rightmin: 2
});
export { hyphenateFi };