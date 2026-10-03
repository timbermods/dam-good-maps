//! The portable maths every Rust port shares (PLAN §20 D366, D401; from investigation/portable-math, #171).
//!
//! The same bits as `src/core/math/portable.ts` and `detmath.ts` on every target: each function is built from
//! + − × ÷, floor and comparisons in a fixed order. No libm, no FMA, no native sqrt or floating remainder
//! (`tools/rust/guard.mjs` rejects them in the source, the optimized IR, the assembly and the Wasm).
//! For finite map arguments, not a general maths library: `pow` refuses what is outside `exp`'s range.
//! `tools/rust/check.mjs` compares every function with portable.ts, natively and in WebAssembly.

const PI:f64=3.141592653589793;
const HALF_PI:f64=1.5707963267948966;
const TWO_PI:f64=6.283185307179586;
const LN2:f64=0.6931471805599453;
// Exact binary long division. This preserves JS remainder and signed zero without fmod.
pub fn rem(x:f64,y:f64)->f64 {
    let sign=x.to_bits()&(1u64<<63);
    let ux=x.to_bits()&((1u64<<63)-1);let uy=y.to_bits()&((1u64<<63)-1);
    if uy==0 || ux>=0x7ff0000000000000 || uy>0x7ff0000000000000 {return f64::NAN;}
    if ux<uy {return x;}
    if ux==uy {return f64::from_bits(sign);}
    fn parts(bits:u64)->(u64,i32) {
        let raw=(bits>>52) as i32;let mut m=(bits&((1u64<<52)-1))|if raw!=0 {1u64<<52} else {0};
        let mut e=if raw!=0 {raw-1075} else {-1074};
        let shift=m.leading_zeros() as i32-11;m<<=shift;e-=shift;(m,e)
    }
    let (mx,ex)=parts(ux);let (my,ey)=parts(uy);let mut r=mx%my;
    for _ in 0..(ex-ey) {r<<=1;if r>=my {r-=my;}if r==0 {return f64::from_bits(sign);}}
    if r==0 {return f64::from_bits(sign);}
    let k=63-r.leading_zeros() as i32;let exponent=ey+k;
    let bits=if exponent>=-1022 {
        ((exponent+1023) as u64)<<52|((r<<(52-k))&((1u64<<52)-1))
    }else {let shift=ey+1074;if shift>=0 {r<<shift} else {r>>(-shift)}};
    f64::from_bits(sign|bits)
}
// Exact integer midpoint rounding, the same algorithm as portable.ts sqrtJS.
pub fn sqrt(x:f64)->f64 {
    if x==0.0 || x==f64::INFINITY {return x;}
    if !(x>0.0) {return f64::NAN;}
    let bits=x.to_bits();let raw=((bits>>52)&2047) as i32;
    let mask=(1u64<<52)-1;let m=(bits&mask)|if raw!=0 {1u64<<52} else {0};
    let e=if raw!=0 {raw-1075} else {-1074};
    let mut r=(e+(64-m.leading_zeros()) as i32-1).div_euclid(2);
    let n=(m as u128)<<((e+104-2*r) as u32);
    let mut q=1u128<<((128-n.leading_zeros()).div_ceil(2));
    loop {let next=(q+n/q)>>1;if next>=q {break;}q=next;}
    let midpoint=2*q+1;if 4*n>midpoint*midpoint {q+=1;}
    if q==1u128<<53 {q>>=1;r+=1;}
    f64::from_bits(((r+1023) as u64)<<52|((q as u64)&mask))
}
pub fn hypot(args:&[f64])->f64 {
    let mut scale=0.0;for x in args {scale=max(scale,x.abs());}
    if scale==f64::INFINITY || scale==0.0 {return scale;}
    let mut sum=0.0;for x in args {let r=x/scale;sum+=r*r;}
    scale*sqrt(sum)
}
pub fn tan(x:f64)->f64 {sin(x)/cos(x)}
pub fn asin(x:f64)->f64 {atan2(x,sqrt((1.0-x)*(1.0+x)))}
pub fn acos(x:f64)->f64 {atan2(sqrt((1.0-x)*(1.0+x)),x)}
pub fn log2(x:f64)->f64 {log(x)/LN2}
pub fn tanh(x:f64)->f64 {let a=exp(-2.0*x.abs());(if x<0.0 {-1.0} else {1.0})*((1.0-a)/(1.0+a))}
pub fn asinh(x:f64)->f64 {if x==0.0 {return x;}let a=x.abs();(if x<0.0 {-1.0} else {1.0})*log(a+hypot(&[a,1.0]))}
pub fn max(a: f64, b: f64) -> f64 {
        if a.is_nan() || b.is_nan() {
            f64::NAN
        } else if a == 0.0 && b == 0.0 {
            if a.is_sign_positive() || b.is_sign_positive() {
                0.0
            } else {
                -0.0
            }
        } else if a > b {
            a
        } else {
            b
        }
    }
pub fn min(a: f64, b: f64) -> f64 {
    -max(-a, -b)
}
pub fn round(v: f64) -> f64 {
    let f = v.floor();
    let r = if v - f < 0.5 { f } else { f + 1.0 };
    if r == 0.0 && v.is_sign_negative() {
        -0.0
    } else {
        r
    }
}
pub fn sin(x: f64) -> f64 {
    let mut r = x - TWO_PI * (x / TWO_PI).floor();
    if r > PI {
        r -= TWO_PI;
    }
    if r > HALF_PI {
        r = PI - r;
    } else if r < -HALF_PI {
        r = -PI - r;
    }
    let r2 = r * r;
    let mut p = -2.8114572543455206e-15;
    p = p * r2 + 7.647163731819816e-13;
    p = p * r2 - 1.6059043836821613e-10;
    p = p * r2 + 2.505210838544172e-8;
    p = p * r2 - 2.7557319223985893e-6;
    p = p * r2 + 1.984126984126984e-4;
    p = p * r2 - 8.333333333333333e-3;
    p = p * r2 + 1.6666666666666666e-1;
    r - r * r2 * p
}
pub fn cos(x: f64) -> f64 {
    sin(x + HALF_PI)
}
pub fn exp(x: f64) -> f64 {
    let k = round(x / LN2);
    let r = x - k * LN2;
    let mut term = 1.0;
    let mut sum = 1.0;
    for i in 1..=20 {
        term = (term * r) / i as f64;
        sum += term;
    }
    let mut scale = 1.0;
    let mut base = if k >= 0.0 { 2.0 } else { 0.5 };
    let mut n = k.abs() as u32;
    while n > 0 {
        if n & 1 != 0 {
            scale *= base;
        }
        base *= base;
        n >>= 1;
    }
    sum * scale
}
pub fn log(x: f64) -> f64 {
    if x == 0.0 {
        return f64::NEG_INFINITY;
    }
    if !(x > 0.0) {
        return f64::NAN;
    }
    if x == f64::INFINITY {
        return x;
    }
    let mut m = x;
    let mut exponent = 0.0;
    while m >= 2.0 {
        m *= 0.5;
        exponent += 1.0;
    }
    while m < 1.0 {
        m *= 2.0;
        exponent -= 1.0;
    }
    let z = (m - 1.0) / (m + 1.0);
    let z2 = z * z;
    let mut term = z;
    let mut sum = z;
    for k in 1..=24 {
        term *= z2;
        sum += term / (2 * k + 1) as f64;
    }
    exponent * LN2 + 2.0 * sum
}
pub fn pow(x: f64, y: f64) -> f64 {
    if y == 0.0 {
        return 1.0;
    }
    if y.fract() == 0.0 && y.abs() <= 1024.0 {
        let mut n = y.abs() as u32;
        let mut b = x;
        let mut result = 1.0;
        while n > 0 {
            if n % 2 == 1 {
                result *= b;
            }
            n /= 2;
            if n > 0 {
                b *= b;
            }
        }
        return if y < 0.0 { 1.0 / result } else { result };
    }
    if x == 0.0 && y > 0.0 {
        return 0.0;
    }
    assert!(x > 0.0 && x.is_finite() && y.is_finite());
    let v = y * log(x);
    assert!(v.abs() < 700.0);
    exp(v)
}
pub fn atan(x: f64) -> f64 {
    if !x.is_finite() {
        return if x.is_nan() {
            f64::NAN
        } else if x < 0.0 {
            -HALF_PI
        } else {
            HALF_PI
        };
    }
    if x == 0.0 {
        return x;
    }
    let sign = if x < 0.0 { -1.0 } else { 1.0 };
    let mut a = x.abs();
    let mut offset = 0.0;
    let mut invert = false;
    if a > 1.0 {
        a = 1.0 / a;
        invert = true;
    }
    if a > 0.41421356237309503 {
        a = (a - 1.0) / (a + 1.0);
        offset = PI / 4.0;
    }
    let a2 = a * a;
    let mut term = a;
    let mut sum = a;
    for k in 1..=24 {
        term *= -a2;
        sum += term / (2 * k + 1) as f64;
    }
    let value = offset + sum;
    sign * if invert { HALF_PI - value } else { value }
}
pub fn atan2(y: f64, x: f64) -> f64 {
    if x.is_nan() || y.is_nan() {
        return f64::NAN;
    }
    let ny = y.is_sign_negative();
    let nx = x.is_sign_negative();
    if y == 0.0 {
        return if nx {
            if ny {
                -PI
            } else {
                PI
            }
        } else {
            y
        };
    }
    if x == 0.0 {
        return if y < 0.0 { -HALF_PI } else { HALF_PI };
    }
    if !x.is_finite() && !y.is_finite() {
        return (if ny { -1.0 } else { 1.0 }) * (if nx { (3.0 * PI) / 4.0 } else { PI / 4.0 });
    }
    let a = atan((y / x).abs());
    let b = if x < 0.0 { PI - a } else { a };
    if y < 0.0 {
        -b
    } else {
        b
    }
}
