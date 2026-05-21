# Purcell-Aligned Mafiking Question Bank

Status: draft reference bank  
Created for: new_mafiking recommendation and future question seeding  
Source alignment: Purcell/Varberg/Rigdon Calculus chapter and section topics  
Copyright rule: questions below are original Mafiking questions. They are not copied from Purcell and should not be treated as reproduced Purcell exercises.

## How To Use This File

- Use `weakness_tags` to map canvas/profile mistakes to follow-up practice.
- Use `purcell_reference` to recommend the matching Purcell chapter/section when the learner owns the book.
- Use `difficulty` as Mafiking difficulty metadata. Current DB only supports `Easy`, `Medium`, and `Hard`; keep `Super Hard` in this reference file until the schema/UI supports it.
- Use `story_problem: true` for longer applied problems. These are the best candidates for `Super Hard`.
- If importing into `problems`, convert the fields into the existing Mafiking schema and add full `problem_steps`.

## Difficulty Scale

- `Easy`: one direct concept or rule.
- `Medium`: one main concept plus algebra or interpretation.
- `Hard`: multiple concepts, careful setup, or nontrivial simplification.
- `Super Hard`: applied/story problem, multi-step modeling, or synthesis across sections.

## Topic Coverage

This bank follows the visible chapter structure of the local Purcell PDF:

- Chapter 0: Preliminaries
- Chapter 1: Limits
- Chapter 2: The Derivative
- Chapter 3: Applications of the Derivative
- Chapter 4: The Definite Integral
- Chapter 5: Applications of the Integral
- Chapter 6: Transcendental Functions
- Chapter 7: Techniques of Integration
- Chapter 8: Indeterminate Forms and Improper Integrals
- Chapter 9: Infinite Series
- Chapter 10: Conics and Polar Coordinates
- Chapter 11: Geometry in Space and Vectors
- Chapter 12: Derivatives for Functions of Two or More Variables
- Chapter 13: Multiple Integrals
- Chapter 14: Vector Calculus

---

## MF-PUR-0001

purcell_reference: Chapter 0, inequalities and absolute values  
chapter: Preliminaries  
subtopic: Inequalities and Absolute Values  
difficulty: Easy  
story_problem: false  
weakness_tags: ["inequality manipulation", "absolute value cases", "interval notation"]  
recommendation_trigger: Learner mishandles signs when multiplying inequalities or forgets absolute value cases.  
question_display: `Selesaikan pertidaksamaan |2x - 5| < 7 dan tuliskan jawabannya dalam notasi interval.`  
question_text: Selesaikan nilai mutlak dua sisi dengan memecah ke pertidaksamaan majemuk.  
answer_display: `-1 < x < 6`  
solution_sketch:
1. Ubah `|2x - 5| < 7` menjadi `-7 < 2x - 5 < 7`.
2. Tambahkan 5 ke semua ruas: `-2 < 2x < 12`.
3. Bagi 2: `-1 < x < 6`.
4. Jawaban interval: `(-1, 6)`.

## MF-PUR-0002

purcell_reference: Chapter 0, functions and their graphs  
chapter: Preliminaries  
subtopic: Functions and Domain  
difficulty: Medium  
story_problem: false  
weakness_tags: ["domain restrictions", "square root domain", "rational function domain"]  
recommendation_trigger: Learner ignores denominator nonzero or radicand nonnegative conditions.  
question_display: `Tentukan domain fungsi f(x)=\dfrac{\sqrt{x+3}}{x^2-4}.`  
question_text: Tentukan semua x yang membuat akar terdefinisi dan penyebut tidak nol.  
answer_display: `[-3, \infty) \setminus \{-2,2\}`  
solution_sketch:
1. Akar butuh `x+3 >= 0`, jadi `x >= -3`.
2. Penyebut tidak boleh nol: `x^2 - 4 != 0`, jadi `x != -2` dan `x != 2`.
3. Karena `-2` berada dalam `[-3, \infty)`, keluarkan juga `-2`.
4. Domain lengkap: `[-3, \infty) \setminus \{-2,2\}`.

## MF-PUR-0101

purcell_reference: Chapter 1, introduction to limits  
chapter: Limits  
subtopic: Algebraic Limits  
difficulty: Easy  
story_problem: false  
weakness_tags: ["factoring limits", "removable discontinuity", "zero over zero"]  
recommendation_trigger: Learner substitutes directly into `0/0` and stops.  
question_display: `Hitung \lim_{x\to 3}\dfrac{x^2-9}{x-3}.`  
question_text: Hitung limit rasional dengan faktorisasi.  
answer_display: `6`  
solution_sketch:
1. Substitusi langsung memberi `0/0`, jadi perlu sederhanakan.
2. Faktorkan `x^2-9=(x-3)(x+3)`.
3. Untuk `x != 3`, pecahan menjadi `x+3`.
4. Limitnya `3+3=6`.

## MF-PUR-0102

purcell_reference: Chapter 1, limits involving trigonometric functions  
chapter: Limits  
subtopic: Trigonometric Limits  
difficulty: Medium  
story_problem: false  
weakness_tags: ["standard trig limit", "angle scaling", "sine limit"]  
recommendation_trigger: Learner uses `sin x / x = 1` without matching the angle.  
question_display: `Hitung \lim_{x\to 0}\dfrac{\sin(5x)}{2x}.`  
question_text: Gunakan limit standar sin u per u.  
answer_display: `\dfrac{5}{2}`  
solution_sketch:
1. Tulis `\dfrac{\sin(5x)}{2x}=\dfrac{5}{2}\cdot\dfrac{\sin(5x)}{5x}`.
2. Saat `x -> 0`, `5x -> 0`.
3. Limit standar `\lim_{u\to0}\sin u/u=1`.
4. Hasil akhir `5/2`.

## MF-PUR-0103

purcell_reference: Chapter 1, limits at infinity and infinite limits  
chapter: Limits  
subtopic: Limits at Infinity  
difficulty: Medium  
story_problem: false  
weakness_tags: ["dominant term", "rational limit at infinity", "degree comparison"]  
recommendation_trigger: Learner compares constants instead of leading terms.  
question_display: `Hitung \lim_{x\to\infty}\dfrac{4x^3-x+2}{7x^3+5x^2-1}.`  
question_text: Bandingkan suku pangkat tertinggi pada fungsi rasional.  
answer_display: `\dfrac{4}{7}`  
solution_sketch:
1. Pangkat tertinggi pembilang dan penyebut sama-sama 3.
2. Bagi semua suku dengan `x^3`.
3. Suku `1/x`, `1/x^2`, `1/x^3` menuju 0.
4. Limitnya rasio koefisien utama: `4/7`.

## MF-PUR-0104

purcell_reference: Chapter 1, continuity of functions  
chapter: Limits  
subtopic: Continuity and Piecewise Functions  
difficulty: Hard  
story_problem: false  
weakness_tags: ["piecewise continuity", "left limit", "right limit", "parameter solving"]  
recommendation_trigger: Learner checks only one side of a piecewise boundary.  
question_display: `Tentukan nilai a agar f(x)=\begin{cases} ax+1, & x<2 \\ x^2-a, & x\ge 2 \end{cases} kontinu di x=2.`  
question_text: Samakan limit kiri dan nilai fungsi di titik sambung.  
answer_display: `a=1`  
solution_sketch:
1. Limit kiri di `x=2`: `2a+1`.
2. Nilai dari cabang kanan di `x=2`: `4-a`.
3. Kontinu jika `2a+1=4-a`.
4. Maka `3a=3`, sehingga `a=1`.

## MF-PUR-0201

purcell_reference: Chapter 2, rules for finding derivatives  
chapter: The Derivative  
subtopic: Derivative Rules  
difficulty: Easy  
story_problem: false  
weakness_tags: ["power rule", "constant multiple", "sum rule"]  
recommendation_trigger: Learner forgets menurunkan konstanta atau salah pangkat.  
question_display: `Jika y=5x^4-3x^2+9, tentukan \dfrac{dy}{dx}.`  
question_text: Turunkan polinom suku demi suku.  
answer_display: `20x^3-6x`  
solution_sketch:
1. Aturan pangkat: `d(x^n)/dx = nx^{n-1}`.
2. `d(5x^4)/dx=20x^3`.
3. `d(-3x^2)/dx=-6x`.
4. Turunan konstanta 9 adalah 0.

## MF-PUR-0202

purcell_reference: Chapter 2, the chain rule  
chapter: The Derivative  
subtopic: Chain Rule  
difficulty: Medium  
story_problem: false  
weakness_tags: ["chain rule", "outer-inner function", "composite derivative"]  
recommendation_trigger: Learner differentiates the outer function but omits derivative of the inside.  
question_display: `Tentukan turunan y=(3x^2-4x+1)^5.`  
question_text: Gunakan aturan rantai untuk fungsi pangkat komposit.  
answer_display: `5(3x^2-4x+1)^4(6x-4)`  
solution_sketch:
1. Fungsi luar adalah `u^5`, fungsi dalam `u=3x^2-4x+1`.
2. Turunan luar: `5u^4`.
3. Turunan dalam: `6x-4`.
4. Kalikan: `5(3x^2-4x+1)^4(6x-4)`.

## MF-PUR-0203

purcell_reference: Chapter 2, implicit differentiation  
chapter: The Derivative  
subtopic: Implicit Differentiation  
difficulty: Hard  
story_problem: false  
weakness_tags: ["implicit differentiation", "dy/dx isolation", "product rule with y"]  
recommendation_trigger: Learner treats y as a constant while differentiating with respect to x.  
question_display: `Jika x^2+xy+y^2=12, tentukan \dfrac{dy}{dx}.`  
question_text: Turunkan persamaan implisit dan isolasi dy/dx.  
answer_display: `-\dfrac{2x+y}{x+2y}`  
solution_sketch:
1. Turunkan `x^2` menjadi `2x`.
2. Turunkan `xy` dengan aturan hasil kali: `x y' + y`.
3. Turunkan `y^2` menjadi `2y y'`.
4. Susun: `2x + x y' + y + 2y y' = 0`.
5. Faktor `y'`: `(x+2y)y'=-(2x+y)`.

## MF-PUR-0204

purcell_reference: Chapter 2, related rates  
chapter: The Derivative  
subtopic: Related Rates  
difficulty: Super Hard  
story_problem: true  
weakness_tags: ["related rates", "geometric modeling", "chain rule", "units"]  
recommendation_trigger: Learner cannot translate a changing geometry story into an equation before differentiating.  
question_display: `Sebuah tangga panjang 10 m bersandar pada dinding vertikal. Ujung bawah tangga menjauh dari dinding dengan laju 0.6 m/s. Ketika ujung bawah berjarak 6 m dari dinding, seberapa cepat ujung atas turun?`  
question_text: Modelkan tangga sebagai segitiga siku-siku dengan sisi berubah terhadap waktu.  
answer_display: `-0.45\text{ m/s}`  
solution_sketch:
1. Misalkan `x` jarak bawah tangga dari dinding dan `y` tinggi ujung atas.
2. Hubungan geometri: `x^2+y^2=100`.
3. Turunkan terhadap waktu: `2x dx/dt + 2y dy/dt = 0`.
4. Saat `x=6`, `y=\sqrt{100-36}=8`.
5. `dy/dt=-(x/y)dx/dt=-(6/8)(0.6)=-0.45`.

## MF-PUR-0301

purcell_reference: Chapter 3, monotonicity and concavity  
chapter: Applications of the Derivative  
subtopic: Increasing, Decreasing, and Concavity  
difficulty: Medium  
story_problem: false  
weakness_tags: ["first derivative sign", "second derivative", "critical points"]  
recommendation_trigger: Learner confuses where function is increasing with where function is positive.  
question_display: `Untuk f(x)=x^3-6x^2+9x, tentukan interval naik dan turun.`  
question_text: Gunakan tanda turunan pertama.  
answer_display: `Naik pada (-\infty,1)\cup(3,\infty), turun pada (1,3)`  
solution_sketch:
1. `f'(x)=3x^2-12x+9=3(x-1)(x-3)`.
2. Titik kritis: `x=1` dan `x=3`.
3. Uji tanda `f'`: positif sebelum 1, negatif antara 1 dan 3, positif setelah 3.
4. Maka fungsi naik-turun-naik.

## MF-PUR-0302

purcell_reference: Chapter 3, practical problems  
chapter: Applications of the Derivative  
subtopic: Optimization  
difficulty: Super Hard  
story_problem: true  
weakness_tags: ["optimization modeling", "constraint substitution", "area maximization", "endpoint awareness"]  
recommendation_trigger: Learner differentiates before forming one-variable objective function.  
question_display: `Seorang petani memiliki 120 m pagar untuk membuat kandang persegi panjang yang menempel pada sungai, sehingga sisi sepanjang sungai tidak perlu dipagar. Tentukan ukuran kandang agar luas maksimum.`  
question_text: Bentuk fungsi luas satu variabel dari kendala pagar tiga sisi.  
answer_display: `30\text{ m} \times 60\text{ m}`  
solution_sketch:
1. Misalkan lebar tegak lurus sungai `x`, panjang sejajar sungai `y`.
2. Pagar hanya tiga sisi: `2x+y=120`, jadi `y=120-2x`.
3. Luas `A=xy=x(120-2x)=120x-2x^2`.
4. `A'(x)=120-4x=0`, maka `x=30`.
5. `y=120-2(30)=60`.
6. Karena parabola membuka ke bawah, luas maksimum.

## MF-PUR-0303

purcell_reference: Chapter 3, antiderivatives and differential equations  
chapter: Applications of the Derivative  
subtopic: Initial Value Antiderivative  
difficulty: Medium  
story_problem: false  
weakness_tags: ["antiderivative", "initial condition", "constant of integration"]  
recommendation_trigger: Learner finds antiderivative but forgets using the initial condition.  
question_display: `Jika f'(x)=6x-4 dan f(2)=7, tentukan f(x).`  
question_text: Integralkan turunan lalu gunakan nilai awal.  
answer_display: `3x^2-4x+3`  
solution_sketch:
1. Integralkan: `f(x)=3x^2-4x+C`.
2. Gunakan `f(2)=7`.
3. `3(4)-8+C=7`, sehingga `4+C=7`.
4. `C=3`, jadi `f(x)=3x^2-4x+3`.

## MF-PUR-0401

purcell_reference: Chapter 4, the definite integral  
chapter: The Definite Integral  
subtopic: Definite Integral as Net Area  
difficulty: Easy  
story_problem: false  
weakness_tags: ["definite integral", "net area", "antiderivative evaluation"]  
recommendation_trigger: Learner computes antiderivative but does not evaluate upper minus lower.  
question_display: `Hitung \int_0^3 (2x+1)\,dx.`  
question_text: Evaluasi integral tentu dengan antiturunan.  
answer_display: `12`  
solution_sketch:
1. Antiturunan dari `2x+1` adalah `x^2+x`.
2. Evaluasi di 3: `9+3=12`.
3. Evaluasi di 0: `0`.
4. Integral tentu `12-0=12`.

## MF-PUR-0402

purcell_reference: Chapter 4, first fundamental theorem of calculus  
chapter: The Definite Integral  
subtopic: FTC Part 1  
difficulty: Medium  
story_problem: false  
weakness_tags: ["fundamental theorem", "variable upper limit", "chain rule in FTC"]  
recommendation_trigger: Learner forgets multiplying by derivative of the upper limit.  
question_display: `Jika F(x)=\int_1^{x^2} \sqrt{1+t^3}\,dt, tentukan F'(x).`  
question_text: Gunakan teorema dasar kalkulus dengan batas atas komposit.  
answer_display: `2x\sqrt{1+x^6}`  
solution_sketch:
1. Untuk `G(u)=\int_1^u \sqrt{1+t^3}\,dt`, berlaku `G'(u)=\sqrt{1+u^3}`.
2. Di sini `u=x^2`.
3. Aturan rantai memberi `F'(x)=G'(x^2)\cdot 2x`.
4. Hasil `2x\sqrt{1+(x^2)^3}=2x\sqrt{1+x^6}`.

## MF-PUR-0403

purcell_reference: Chapter 4, method of substitution  
chapter: The Definite Integral  
subtopic: Substitution in Definite Integrals  
difficulty: Medium  
story_problem: false  
weakness_tags: ["u substitution", "changing bounds", "definite integral substitution"]  
recommendation_trigger: Learner substitutes integrand but forgets changing bounds.  
question_display: `Hitung \int_0^1 6x(1+x^2)^2\,dx.`  
question_text: Gunakan substitusi dengan batas baru.  
answer_display: `7`  
solution_sketch:
1. Pilih `u=1+x^2`, maka `du=2x dx`.
2. `6x dx = 3du`.
3. Batas: saat `x=0`, `u=1`; saat `x=1`, `u=2`.
4. Integral menjadi `3\int_1^2 u^2 du = [u^3]_1^2 = 8-1=7`.

## MF-PUR-0501

purcell_reference: Chapter 5, area of a plane region  
chapter: Applications of the Integral  
subtopic: Area Between Curves  
difficulty: Hard  
story_problem: false  
weakness_tags: ["area between curves", "intersection points", "top minus bottom"]  
recommendation_trigger: Learner integrates right functions but reverses top and bottom.  
question_display: `Tentukan luas daerah yang dibatasi oleh y=x dan y=x^2.`  
question_text: Cari titik potong lalu integralkan fungsi atas dikurangi fungsi bawah.  
answer_display: `\dfrac{1}{6}`  
solution_sketch:
1. Titik potong dari `x=x^2` adalah `x=0` dan `x=1`.
2. Pada `[0,1]`, `x` berada di atas `x^2`.
3. Luas `\int_0^1 (x-x^2) dx`.
4. Hasil `[\frac{x^2}{2}-\frac{x^3}{3}]_0^1=1/2-1/3=1/6`.

## MF-PUR-0502

purcell_reference: Chapter 5, volumes of solids by disks and washers  
chapter: Applications of the Integral  
subtopic: Volumes by Washers  
difficulty: Hard  
story_problem: false  
weakness_tags: ["washer method", "radius identification", "volume of revolution"]  
recommendation_trigger: Learner uses radius diameter or forgets squaring radii.  
question_display: `Daerah di bawah y=\sqrt{x} dari x=0 sampai x=4 diputar terhadap sumbu-x. Tentukan volumenya.`  
question_text: Gunakan metode disk dengan jari-jari y.  
answer_display: `8\pi`  
solution_sketch:
1. Jari-jari disk adalah `R(x)=\sqrt{x}`.
2. Luas penampang `\pi R^2=\pi x`.
3. Volume `V=\int_0^4 \pi x dx`.
4. `V=\pi[x^2/2]_0^4=8\pi`.

## MF-PUR-0503

purcell_reference: Chapter 5, work and fluid force  
chapter: Applications of the Integral  
subtopic: Work  
difficulty: Super Hard  
story_problem: true  
weakness_tags: ["work integral", "Hooke law", "unit setup", "applied integration"]  
recommendation_trigger: Learner knows integral but cannot define force as a function of displacement.  
question_display: `Sebuah pegas membutuhkan gaya 18 N untuk ditarik 0.3 m dari panjang alaminya. Berapa usaha untuk menarik pegas dari 0.1 m sampai 0.5 m dari panjang alami?`  
question_text: Gunakan hukum Hooke F=kx dan integralkan gaya terhadap perpindahan.  
answer_display: `7.2\text{ J}`  
solution_sketch:
1. Dari `F=kx`, `18=k(0.3)`, maka `k=60`.
2. Usaha dari `0.1` ke `0.5` adalah `\int_{0.1}^{0.5}60x dx`.
3. Hasil `30x^2|_{0.1}^{0.5}`.
4. `30(0.25-0.01)=30(0.24)=7.2`.

## MF-PUR-0601

purcell_reference: Chapter 6, natural logarithm and exponential functions  
chapter: Transcendental Functions  
subtopic: Logarithmic Differentiation  
difficulty: Medium  
story_problem: false  
weakness_tags: ["logarithmic differentiation", "product powers", "domain awareness"]  
recommendation_trigger: Learner expands logarithms incorrectly or skips implicit differentiation.  
question_display: `Gunakan diferensiasi logaritmik untuk menurunkan y=x^2\sqrt{x+1}, x>0.`  
question_text: Ambil log natural kedua sisi lalu turunkan.  
answer_display: `x\sqrt{x+1}\left(2+\dfrac{x}{2(x+1)}\right)`  
solution_sketch:
1. `\ln y=2\ln x+\frac12\ln(x+1)`.
2. Turunkan: `y'/y=2/x+1/[2(x+1)]`.
3. Maka `y'=x^2\sqrt{x+1}(2/x+1/[2(x+1)])`.
4. Bentuk setara dapat disederhanakan.

## MF-PUR-0602

purcell_reference: Chapter 6, exponential growth and decay  
chapter: Transcendental Functions  
subtopic: Exponential Growth and Decay  
difficulty: Super Hard  
story_problem: true  
weakness_tags: ["exponential model", "half life", "log solving", "parameter fitting"]  
recommendation_trigger: Learner applies linear decay to exponential decay data.  
question_display: `Sampel zat radioaktif tersisa 72% setelah 4 jam. Dengan model A(t)=A_0e^{-kt}, berapa persen yang tersisa setelah 10 jam?`  
question_text: Tentukan k dari data persentase, lalu prediksi waktu baru.  
answer_display: `0.72^{2.5}\cdot100\%`  
solution_sketch:
1. Dari `A(4)/A_0=0.72=e^{-4k}`.
2. Maka `e^{-k}=0.72^{1/4}`.
3. `A(10)/A_0=e^{-10k}=(e^{-4k})^{10/4}=0.72^{2.5}`.
4. Nilai pendekatan sekitar `43.97%`.

## MF-PUR-0603

purcell_reference: Chapter 6, first-order linear differential equations  
chapter: Transcendental Functions  
subtopic: First-Order Linear Differential Equations  
difficulty: Hard  
story_problem: false  
weakness_tags: ["linear differential equation", "integrating factor", "initial value"]  
recommendation_trigger: Learner separates a nonseparable linear ODE incorrectly.  
question_display: `Selesaikan y'+2y=6, dengan y(0)=1.`  
question_text: Selesaikan persamaan diferensial linear orde satu.  
answer_display: `y=3-2e^{-2x}`  
solution_sketch:
1. Solusi homogen: `y_h=Ce^{-2x}`.
2. Solusi konstan particular: `y_p=3`.
3. Solusi umum `y=3+Ce^{-2x}`.
4. Gunakan `y(0)=1`: `1=3+C`, jadi `C=-2`.

## MF-PUR-0701

purcell_reference: Chapter 7, integration by parts  
chapter: Techniques of Integration  
subtopic: Integration by Parts  
difficulty: Medium  
story_problem: false  
weakness_tags: ["integration by parts", "LIATE choice", "product integration"]  
recommendation_trigger: Learner uses substitution on product forms where integration by parts is cleaner.  
question_display: `Hitung \int x e^{2x}\,dx.`  
question_text: Gunakan integral parsial dengan u=x.  
answer_display: `\dfrac{x e^{2x}}{2}-\dfrac{e^{2x}}{4}+C`  
solution_sketch:
1. Ambil `u=x`, `dv=e^{2x}dx`.
2. Maka `du=dx`, `v=e^{2x}/2`.
3. `\int u\,dv=uv-\int v\,du`.
4. Hasil `xe^{2x}/2-\int e^{2x}/2 dx = xe^{2x}/2-e^{2x}/4+C`.

## MF-PUR-0702

purcell_reference: Chapter 7, trigonometric integrals  
chapter: Techniques of Integration  
subtopic: Trigonometric Integrals  
difficulty: Hard  
story_problem: false  
weakness_tags: ["trig integral", "odd power strategy", "Pythagorean identity"]  
recommendation_trigger: Learner does not separate one trig factor when an odd power appears.  
question_display: `Hitung \int \sin^3 x \cos^2 x\,dx.`  
question_text: Pisahkan satu faktor sin x dan ubah sisanya memakai identitas.  
answer_display: `-\dfrac{\cos^3 x}{3}+\dfrac{\cos^5 x}{5}+C`  
solution_sketch:
1. Tulis `\sin^3x=\sin^2x\sin x=(1-\cos^2x)\sin x`.
2. Integral menjadi `\int (1-\cos^2x)\cos^2x\sin x dx`.
3. Substitusi `u=\cos x`, `du=-\sin x dx`.
4. Integral `-\int (u^2-u^4)du`.
5. Hasil `-u^3/3+u^5/5+C`.

## MF-PUR-0703

purcell_reference: Chapter 7, partial fractions  
chapter: Techniques of Integration  
subtopic: Rational Functions and Partial Fractions  
difficulty: Hard  
story_problem: false  
weakness_tags: ["partial fractions", "linear factors", "log absolute value"]  
recommendation_trigger: Learner splits rational functions without solving coefficients.  
question_display: `Hitung \int \dfrac{5x+1}{x^2-x-2}\,dx.`  
question_text: Faktorkan penyebut dan gunakan pecahan parsial.  
answer_display: `\dfrac{11}{3}\ln|x-2|+\dfrac{4}{3}\ln|x+1|+C`  
solution_sketch:
1. Faktorkan `x^2-x-2=(x-2)(x+1)`.
2. Tulis `(5x+1)/[(x-2)(x+1)] = A/(x-2)+B/(x+1)`.
3. `5x+1=A(x+1)+B(x-2)`.
4. Dari koefisien: `A+B=5`, `A-2B=1`.
5. Diperoleh `A=11/3`, `B=4/3`.

## MF-PUR-0704

purcell_reference: Chapter 7, strategies for integration  
chapter: Techniques of Integration  
subtopic: Mixed Integration Strategy  
difficulty: Super Hard  
story_problem: false  
weakness_tags: ["integration strategy", "substitution after algebra", "recognizing structure"]  
recommendation_trigger: Learner tries one integration technique mechanically without simplifying the integrand.  
question_display: `Hitung \int \dfrac{x^3}{\sqrt{x^2+4}}\,dx.`  
question_text: Pecah x^3 menjadi x(x^2+4-4), lalu substitusi.  
answer_display: `\dfrac{1}{3}(x^2+4)^{3/2}-4\sqrt{x^2+4}+C`  
solution_sketch:
1. Tulis `x^3=x(x^2+4)-4x`.
2. Integral menjadi `\int x\sqrt{x^2+4}dx - 4\int x/\sqrt{x^2+4}dx`.
3. Untuk keduanya, gunakan `u=x^2+4`, `du=2x dx`.
4. Hasil `\frac13u^{3/2}-4u^{1/2}+C`.
5. Substitusi balik `u=x^2+4`.

## MF-PUR-0801

purcell_reference: Chapter 8, indeterminate forms of type 0/0  
chapter: Indeterminate Forms and Improper Integrals  
subtopic: L'Hopital Rule  
difficulty: Medium  
story_problem: false  
weakness_tags: ["L'Hopital rule", "indeterminate form check", "exponential limit"]  
recommendation_trigger: Learner applies L'Hopital without first checking the indeterminate form.  
question_display: `Hitung \lim_{x\to0}\dfrac{e^{3x}-1}{x}.`  
question_text: Verifikasi bentuk 0/0 lalu gunakan L'Hopital atau limit dasar.  
answer_display: `3`  
solution_sketch:
1. Substitusi memberi `(1-1)/0=0/0`.
2. Turunkan pembilang dan penyebut.
3. Limit menjadi `\lim_{x\to0} 3e^{3x}/1`.
4. Hasil `3`.

## MF-PUR-0802

purcell_reference: Chapter 8, improper integrals with infinite limits  
chapter: Indeterminate Forms and Improper Integrals  
subtopic: Improper Integral, Infinite Interval  
difficulty: Hard  
story_problem: false  
weakness_tags: ["improper integral", "convergence", "limit of antiderivative"]  
recommendation_trigger: Learner treats infinity as an ordinary upper bound.  
question_display: `Tentukan apakah \int_1^\infty \dfrac{1}{x^2}\,dx konvergen, dan hitung nilainya jika konvergen.`  
question_text: Ganti batas tak hingga dengan limit.  
answer_display: `1`  
solution_sketch:
1. Tulis `\int_1^\infty x^{-2}dx=\lim_{b\to\infty}\int_1^b x^{-2}dx`.
2. Antiturunan `-1/x`.
3. Evaluasi: `[-1/x]_1^b=-1/b+1`.
4. Saat `b -> infinity`, nilai menuju `1`.

## MF-PUR-0803

purcell_reference: Chapter 8, improper integrals with infinite integrands  
chapter: Indeterminate Forms and Improper Integrals  
subtopic: Improper Integral, Vertical Asymptote  
difficulty: Hard  
story_problem: false  
weakness_tags: ["improper integral", "singular endpoint", "p-integral"]  
recommendation_trigger: Learner integrates across a vertical asymptote without splitting or using limits.  
question_display: `Tentukan apakah \int_0^1 \dfrac{1}{\sqrt{x}}\,dx konvergen, dan hitung nilainya jika konvergen.`  
question_text: Perhatikan integran tak hingga di x=0.  
answer_display: `2`  
solution_sketch:
1. Tulis sebagai limit `\lim_{a\to0^+}\int_a^1 x^{-1/2}dx`.
2. Antiturunan `2\sqrt{x}`.
3. Evaluasi `2-2\sqrt{a}`.
4. Saat `a -> 0+`, nilai menuju `2`.

## MF-PUR-0901

purcell_reference: Chapter 9, infinite sequences  
chapter: Infinite Series  
subtopic: Sequence Limits  
difficulty: Easy  
story_problem: false  
weakness_tags: ["sequence limit", "dominant term", "rational sequence"]  
recommendation_trigger: Learner uses term substitution rather than asymptotic comparison.  
question_display: `Tentukan \lim_{n\to\infty}\dfrac{3n^2+1}{5n^2-7n}.`  
question_text: Bandingkan suku pangkat tertinggi dalam barisan rasional.  
answer_display: `\dfrac{3}{5}`  
solution_sketch:
1. Bagi pembilang dan penyebut dengan `n^2`.
2. Suku `1/n^2` dan `1/n` menuju 0.
3. Limit menjadi `3/5`.

## MF-PUR-0902

purcell_reference: Chapter 9, positive series tests  
chapter: Infinite Series  
subtopic: Ratio Test  
difficulty: Hard  
story_problem: false  
weakness_tags: ["series convergence", "ratio test", "factorial growth"]  
recommendation_trigger: Learner cannot choose a test for factorial or exponential terms.  
question_display: `Tentukan konvergensi deret \sum_{n=1}^{\infty}\dfrac{3^n}{n!}.`  
question_text: Gunakan uji rasio.  
answer_display: `Konvergen`  
solution_sketch:
1. Ambil `a_n=3^n/n!`.
2. Hitung `a_{n+1}/a_n = 3/(n+1)`.
3. Limit rasio saat `n -> infinity` adalah 0.
4. Karena 0 < 1, deret konvergen.

## MF-PUR-0903

purcell_reference: Chapter 9, alternating series and absolute convergence  
chapter: Infinite Series  
subtopic: Alternating Series  
difficulty: Medium  
story_problem: false  
weakness_tags: ["alternating series", "absolute convergence", "conditional convergence", "harmonic series"]  
recommendation_trigger: Learner says alternating always absolutely convergent.  
question_display: `Tentukan apakah \sum_{n=1}^{\infty}\dfrac{(-1)^{n+1}}{n} konvergen absolut, konvergen bersyarat, atau divergen.`  
question_text: Bandingkan deret berganti tanda dengan deret nilai mutlaknya.  
answer_display: `Konvergen bersyarat`  
solution_sketch:
1. Deret berganti tanda dengan `1/n` menurun ke 0, jadi konvergen oleh uji alternating.
2. Deret nilai mutlaknya adalah `\sum 1/n`.
3. Deret harmonik divergen.
4. Maka deret asal konvergen bersyarat.

## MF-PUR-0904

purcell_reference: Chapter 9, Taylor and Maclaurin series  
chapter: Infinite Series  
subtopic: Maclaurin Series  
difficulty: Hard  
story_problem: false  
weakness_tags: ["Maclaurin series", "series substitution", "approximation order"]  
recommendation_trigger: Learner memorizes series but cannot substitute a composite input.  
question_display: `Gunakan deret Maclaurin sampai suku x^6 untuk mendekati e^{-x^2}.`  
question_text: Substitusi u=-x^2 ke deret e^u.  
answer_display: `1-x^2+\dfrac{x^4}{2}-\dfrac{x^6}{6}`  
solution_sketch:
1. Deret `e^u=1+u+u^2/2+u^3/6+\cdots`.
2. Ambil `u=-x^2`.
3. `u^2=x^4`, `u^3=-x^6`.
4. Sampai suku `x^6`: `1-x^2+x^4/2-x^6/6`.

## MF-PUR-1001

purcell_reference: Chapter 10, parametric representation of curves  
chapter: Conics and Polar Coordinates  
subtopic: Parametric Curves  
difficulty: Medium  
story_problem: false  
weakness_tags: ["parametric derivative", "dy/dx", "chain relation"]  
recommendation_trigger: Learner differentiates y with respect to t but forgets dividing by dx/dt.  
question_display: `Untuk x=t^2+1 dan y=t^3-t, tentukan \dfrac{dy}{dx} saat t=2.`  
question_text: Gunakan dy/dx = (dy/dt)/(dx/dt).  
answer_display: `\dfrac{11}{4}`  
solution_sketch:
1. `dx/dt=2t`.
2. `dy/dt=3t^2-1`.
3. `dy/dx=(3t^2-1)/(2t)`.
4. Saat `t=2`, hasil `(12-1)/4=11/4`.

## MF-PUR-1002

purcell_reference: Chapter 10, calculus in polar coordinates  
chapter: Conics and Polar Coordinates  
subtopic: Polar Area  
difficulty: Hard  
story_problem: false  
weakness_tags: ["polar area", "theta bounds", "squaring radius"]  
recommendation_trigger: Learner forgets factor 1/2 in polar area formula.  
question_display: `Tentukan luas daerah yang dibatasi oleh r=2\sin\theta untuk 0\le\theta\le\pi.`  
question_text: Gunakan rumus luas polar.  
answer_display: `\pi`  
solution_sketch:
1. Rumus luas polar: `A=\frac12\int_\alpha^\beta r^2 d\theta`.
2. `r^2=4\sin^2\theta`.
3. `A=2\int_0^\pi \sin^2\theta d\theta`.
4. Karena `\int_0^\pi \sin^2\theta d\theta=\pi/2`, luas `\pi`.

## MF-PUR-1101

purcell_reference: Chapter 11, vectors and dot product  
chapter: Geometry in Space and Vectors  
subtopic: Dot Product and Projection  
difficulty: Medium  
story_problem: false  
weakness_tags: ["dot product", "projection", "vector magnitude"]  
recommendation_trigger: Learner confuses dot product with component-wise multiplication only.  
question_display: `Diberikan a=\langle 3,-1,2\rangle dan b=\langle 2,4,-2\rangle. Tentukan proyeksi skalar a pada b.`  
question_text: Hitung comp_b a = (a dot b)/|b|.  
answer_display: `-\dfrac{1}{\sqrt{6}}`  
solution_sketch:
1. `a\cdot b=3(2)+(-1)(4)+2(-2)=6-4-4=-2`.
2. `|b|=\sqrt{2^2+4^2+(-2)^2}=\sqrt{24}=2\sqrt6`.
3. Proyeksi skalar `(-2)/(2\sqrt6)=-1/\sqrt6`.

## MF-PUR-1102

purcell_reference: Chapter 11, vector-valued functions and curvilinear motion  
chapter: Geometry in Space and Vectors  
subtopic: Curvilinear Motion  
difficulty: Super Hard  
story_problem: true  
weakness_tags: ["vector motion", "velocity", "acceleration", "speed", "interpretation"]  
recommendation_trigger: Learner differentiates vector components but cannot interpret speed and acceleration.  
question_display: `Sebuah partikel bergerak dengan posisi r(t)=\langle t^2, e^t, \ln(t+1)\rangle untuk t>0. Tentukan kecepatan, percepatan, dan speed saat t=1.`  
question_text: Turunkan vektor posisi per komponen dan evaluasi panjang vektor kecepatan.  
answer_display: `v(1)=\langle2,e,\frac12\rangle,\quad a(1)=\langle2,e,-\frac14\rangle,\quad |v(1)|=\sqrt{4+e^2+\frac14}`  
solution_sketch:
1. Kecepatan `v(t)=r'(t)=\langle2t,e^t,1/(t+1)\rangle`.
2. Percepatan `a(t)=v'(t)=\langle2,e^t,-1/(t+1)^2\rangle`.
3. Evaluasi di `t=1`.
4. Speed adalah panjang `v(1)`, bukan vektor percepatan.

## MF-PUR-1201

purcell_reference: Chapter 12, partial derivatives  
chapter: Derivatives for Functions of Two or More Variables  
subtopic: Partial Derivatives  
difficulty: Easy  
story_problem: false  
weakness_tags: ["partial derivative", "holding variables constant", "multivariable notation"]  
recommendation_trigger: Learner differentiates both variables at once instead of holding one fixed.  
question_display: `Jika f(x,y)=x^2y+3xy^2-y, tentukan f_x dan f_y.`  
question_text: Turunkan parsial terhadap masing-masing variabel.  
answer_display: `f_x=2xy+3y^2,\quad f_y=x^2+6xy-1`  
solution_sketch:
1. Untuk `f_x`, anggap `y` konstan.
2. Untuk `f_y`, anggap `x` konstan.
3. Terapkan aturan pangkat pada variabel aktif.

## MF-PUR-1202

purcell_reference: Chapter 12, directional derivatives and gradients  
chapter: Derivatives for Functions of Two or More Variables  
subtopic: Gradient and Directional Derivative  
difficulty: Hard  
story_problem: false  
weakness_tags: ["gradient", "directional derivative", "unit vector"]  
recommendation_trigger: Learner uses direction vector without normalizing it first.  
question_display: `Untuk f(x,y)=x^2+xy+y^2, tentukan turunan arah di (1,2) ke arah v=\langle3,4\rangle.`  
question_text: Hitung gradien lalu dot dengan vektor arah satuan.  
answer_display: `\dfrac{32}{5}`  
solution_sketch:
1. `\nabla f=\langle2x+y,x+2y\rangle`.
2. Di `(1,2)`, `\nabla f=\langle4,5\rangle`.
3. Vektor satuan arah `v` adalah `\langle3/5,4/5\rangle`.
4. Turunan arah `4(3/5)+5(4/5)=32/5`.

## MF-PUR-1203

purcell_reference: Chapter 12, Lagrange multipliers  
chapter: Derivatives for Functions of Two or More Variables  
subtopic: Lagrange Multipliers  
difficulty: Super Hard  
story_problem: true  
weakness_tags: ["Lagrange multipliers", "constraint optimization", "multivariable modeling"]  
recommendation_trigger: Learner cannot optimize with a constraint in two variables.  
question_display: `Sebuah perusahaan ingin membuat kotak tertutup berbentuk balok dengan volume 32 m^3. Biaya bahan sisi atas dan bawah dua kali biaya bahan sisi samping. Jika alas balok berbentuk persegi, tentukan ukuran yang meminimalkan biaya relatif bahan.`  
question_text: Modelkan biaya permukaan dengan kendala volume.  
answer_display: `x=\sqrt[3]{16}\text{ m},\quad h=2\sqrt[3]{16}\text{ m}`  
solution_sketch:
1. Misalkan sisi alas persegi `x` dan tinggi `h`.
2. Volume: `x^2h=32`, jadi `h=32/x^2`.
3. Biaya relatif: atas+bawah bernilai dua kali, jadi `C=4x^2+4xh`.
4. Substitusi `h`: `C=4x^2+128/x`.
5. `C'=8x-128/x^2=0`, jadi `8x^3=128`, `x=\sqrt[3]{16}`.
6. `h=32/x^2=2\sqrt[3]{16}`.

## MF-PUR-1301

purcell_reference: Chapter 13, double integrals over rectangles  
chapter: Multiple Integrals  
subtopic: Double Integrals  
difficulty: Medium  
story_problem: false  
weakness_tags: ["double integral", "iterated integral", "rectangle region"]  
recommendation_trigger: Learner loses constants when integrating with respect to one variable.  
question_display: `Hitung \int_0^2\int_1^3 (x+2y)\,dy\,dx.`  
question_text: Evaluasi integral iterasi dari dalam ke luar.  
answer_display: `20`  
solution_sketch:
1. Integral dalam terhadap `y`: `xy+y^2` dari 1 ke 3.
2. Hasil dalam: `(3x+9)-(x+1)=2x+8`.
3. Integral luar `\int_0^2(2x+8)dx`.
4. Hasil `[x^2+8x]_0^2=4+16=20`.

## MF-PUR-1302

purcell_reference: Chapter 13, double integrals in polar coordinates  
chapter: Multiple Integrals  
subtopic: Double Integrals in Polar Coordinates  
difficulty: Hard  
story_problem: false  
weakness_tags: ["polar double integral", "Jacobian r", "disk region"]  
recommendation_trigger: Learner forgets multiplying by r after converting to polar coordinates.  
question_display: `Hitung \iint_R (x^2+y^2)\,dA, dengan R adalah disk x^2+y^2\le 9.`  
question_text: Ubah ke koordinat polar.  
answer_display: `\dfrac{81\pi}{2}`  
solution_sketch:
1. Dalam polar, `x^2+y^2=r^2` dan `dA=r dr d\theta`.
2. Region disk: `0<=r<=3`, `0<=\theta<=2\pi`.
3. Integral menjadi `\int_0^{2\pi}\int_0^3 r^3 dr d\theta`.
4. Hasil `(2\pi)(3^4/4)=81\pi/2`.

## MF-PUR-1303

purcell_reference: Chapter 13, triple integrals in cylindrical and spherical coordinates  
chapter: Multiple Integrals  
subtopic: Triple Integrals  
difficulty: Super Hard  
story_problem: true  
weakness_tags: ["triple integral", "cylindrical coordinates", "volume modeling", "bounds"]  
recommendation_trigger: Learner cannot choose coordinates and bounds for 3D regions.  
question_display: `Sebuah tangki berbentuk silinder berjari-jari 2 m dan tinggi 5 m memiliki kepadatan fluida \rho(r,z)=1000+20z kg/m^3. Hitung massa total fluida.`  
question_text: Gunakan integral silinder dengan dV = r dr dtheta dz.  
answer_display: `21000\pi\text{ kg}`  
solution_sketch:
1. Region: `0<=r<=2`, `0<=theta<=2\pi`, `0<=z<=5`.
2. Massa `M=\int_0^{2\pi}\int_0^2\int_0^5 (1000+20z) r dz dr d\theta`.
3. Integral terhadap `z`: `1000z+10z^2` dari 0 ke 5 memberi `5250`.
4. Integral `r` dari 0 ke 2 memberi 2.
5. Integral theta memberi `2\pi`.
6. Total `5250*2*2\pi=21000\pi`.

## MF-PUR-1401

purcell_reference: Chapter 14, line integrals  
chapter: Vector Calculus  
subtopic: Line Integrals  
difficulty: Hard  
story_problem: false  
weakness_tags: ["line integral", "parametrization", "vector field work"]  
recommendation_trigger: Learner substitutes curve but forgets dot product with r'(t).  
question_display: `Hitung \int_C \mathbf{F}\cdot d\mathbf{r} untuk \mathbf{F}=\langle y,x\rangle dan C: \mathbf{r}(t)=\langle t,t^2\rangle, 0\le t\le1.`  
question_text: Parametrisasikan field dan kalikan dot dengan turunan kurva.  
answer_display: `1`  
solution_sketch:
1. Pada kurva, `F(r(t))=\langle t^2,t\rangle`.
2. `r'(t)=\langle1,2t\rangle`.
3. Dot product: `t^2+2t^2=3t^2`.
4. Integral `\int_0^1 3t^2dt=1`.

## MF-PUR-1402

purcell_reference: Chapter 14, Green's theorem in the plane  
chapter: Vector Calculus  
subtopic: Green's Theorem  
difficulty: Super Hard  
story_problem: false  
weakness_tags: ["Green theorem", "circulation", "region orientation", "partial derivatives"]  
recommendation_trigger: Learner computes boundary integral directly when theorem gives simpler area integral.  
question_display: `Gunakan Teorema Green untuk menghitung \oint_C (-y\,dx+x\,dy), dengan C adalah lingkaran x^2+y^2=9 berorientasi positif.`  
question_text: Ubah integral garis tertutup menjadi integral luas.  
answer_display: `18\pi`  
solution_sketch:
1. Ambil `P=-y`, `Q=x`.
2. Teorema Green: `\oint_C Pdx+Qdy=\iint_R(Q_x-P_y)dA`.
3. `Q_x=1`, `P_y=-1`, jadi integran `2`.
4. Luas disk radius 3 adalah `9\pi`.
5. Hasil `2(9\pi)=18\pi`.

## MF-PUR-1403

purcell_reference: Chapter 14, Gauss's divergence theorem  
chapter: Vector Calculus  
subtopic: Divergence Theorem  
difficulty: Super Hard  
story_problem: true  
weakness_tags: ["divergence theorem", "flux", "solid sphere", "symmetry"]  
recommendation_trigger: Learner tries surface parameterization even when divergence theorem is cleaner.  
question_display: `Medan kecepatan fluida \mathbf{F}=\langle x,y,z\rangle keluar dari bola padat x^2+y^2+z^2\le a^2. Hitung fluks keluar melalui permukaan bola.`  
question_text: Gunakan teorema divergensi untuk mengubah fluks permukaan menjadi integral volume.  
answer_display: `4\pi a^3`  
solution_sketch:
1. Divergensi `\nabla\cdot F=1+1+1=3`.
2. Fluks keluar `=\iiint_B 3 dV`.
3. Volume bola radius `a` adalah `4\pi a^3/3`.
4. Fluks `3*(4\pi a^3/3)=4\pi a^3`.

---

## Additional Batch 2

These entries extend the same safe pattern: original Mafiking questions aligned to Purcell chapter/section topics.

## MF-PUR-0003

purcell_reference: Chapter 0, operations on functions  
chapter: Preliminaries  
subtopic: Function Composition  
difficulty: Medium  
story_problem: false  
weakness_tags: ["function composition", "algebra expansion", "substitution notation"]  
recommendation_trigger: Learner confuses `f(g(x))` with `f(x)g(x)`.  
question_display: `Diberikan f(x)=x^2+1 dan g(x)=3x-2. Tentukan (f\circ g)(x).`  
question_text: Komposisikan fungsi dengan memasukkan g(x) ke f.  
answer_display: `9x^2-12x+5`  
solution_sketch:
1. `(f\circ g)(x)=f(g(x))`.
2. Karena `f(u)=u^2+1`, maka `f(g(x))=(3x-2)^2+1`.
3. Kembangkan: `(3x-2)^2=9x^2-12x+4`.
4. Tambahkan 1 sehingga hasilnya `9x^2-12x+5`.

## MF-PUR-0004

purcell_reference: Chapter 0, inequalities and absolute values  
chapter: Preliminaries  
subtopic: Absolute Value Equations  
difficulty: Medium  
story_problem: false  
weakness_tags: ["absolute value equation", "case analysis", "extraneous checking"]  
recommendation_trigger: Learner removes absolute value signs without considering both signs.  
question_display: `Selesaikan |x-4|=2|x+1|.`  
question_text: Gunakan kuadrat atau analisis kasus untuk menyelesaikan persamaan nilai mutlak.  
answer_display: `x=-6\ \text{atau}\ x=\dfrac{2}{3}`  
solution_sketch:
1. Kuadratkan kedua sisi: `(x-4)^2=4(x+1)^2`.
2. Kembangkan: `x^2-8x+16=4x^2+8x+4`.
3. Susun: `3x^2+16x-12=0`.
4. Faktorkan atau gunakan rumus kuadrat: akar `x=-6` dan `x=2/3`.
5. Keduanya memenuhi persamaan awal.

## MF-PUR-0105

purcell_reference: Chapter 1, infinite limits  
chapter: Limits  
subtopic: One-Sided Infinite Limits  
difficulty: Easy  
story_problem: false  
weakness_tags: ["one-sided limit", "infinite limit", "sign near asymptote"]  
recommendation_trigger: Learner says a limit diverges without checking from which side.  
question_display: `Hitung \lim_{x\to2^+}\dfrac{3}{x-2}.`  
question_text: Periksa tanda penyebut saat x mendekati 2 dari kanan.  
answer_display: `+\infty`  
solution_sketch:
1. Saat `x -> 2^+`, nilai `x-2` positif dan sangat kecil.
2. Pembilang tetap positif, yaitu 3.
3. Bilangan positif dibagi bilangan positif sangat kecil tumbuh tanpa batas.
4. Limit satu sisinya `+\infty`.

## MF-PUR-0106

purcell_reference: Chapter 1, limit theorems and squeeze theorem  
chapter: Limits  
subtopic: Squeeze Theorem  
difficulty: Medium  
story_problem: false  
weakness_tags: ["squeeze theorem", "bounded oscillation", "limit to zero"]  
recommendation_trigger: Learner gets stuck on oscillatory terms such as `\cos(1/x)`.  
question_display: `Hitung \lim_{x\to0}x^2\cos\left(\dfrac{1}{x}\right).`  
question_text: Gunakan fakta bahwa nilai cosinus selalu di antara -1 dan 1.  
answer_display: `0`  
solution_sketch:
1. Karena `-1 <= cos(1/x) <= 1`.
2. Kalikan dengan `x^2 >= 0`: `-x^2 <= x^2 cos(1/x) <= x^2`.
3. Saat `x -> 0`, kedua pembatas `-x^2` dan `x^2` menuju 0.
4. Dengan Teorema Jepit, limitnya 0.

## MF-PUR-0205

purcell_reference: Chapter 2, quotient rule  
chapter: The Derivative  
subtopic: Quotient Rule  
difficulty: Medium  
story_problem: false  
weakness_tags: ["quotient rule", "algebra simplification", "domain restriction"]  
recommendation_trigger: Learner swaps numerator and denominator order in quotient rule.  
question_display: `Tentukan turunan y=\dfrac{x^2+1}{x-1}.`  
question_text: Gunakan aturan hasil bagi dan sederhanakan pembilangnya.  
answer_display: `\dfrac{x^2-2x-1}{(x-1)^2}`  
solution_sketch:
1. Ambil `u=x^2+1` dan `v=x-1`.
2. Aturan hasil bagi: `y'=(u'v-uv')/v^2`.
3. `u'=2x`, `v'=1`.
4. Pembilang: `2x(x-1)-(x^2+1)=x^2-2x-1`.

## MF-PUR-0206

purcell_reference: Chapter 2, related rates  
chapter: The Derivative  
subtopic: Related Rates with Volume  
difficulty: Super Hard  
story_problem: true  
weakness_tags: ["related rates", "cone volume", "similar triangles", "chain rule", "units"]  
recommendation_trigger: Learner differentiates volume formula before expressing all variables in terms of one changing quantity.  
question_display: `Air masuk ke tangki kerucut dengan laju 2 m^3/menit. Tangki memiliki tinggi 6 m dan jari-jari atas 3 m. Seberapa cepat tinggi air naik saat tinggi air 4 m?`  
question_text: Gunakan kesebangunan kerucut untuk menulis volume sebagai fungsi tinggi air.  
answer_display: `\dfrac{1}{2\pi}\text{ m/menit}`  
solution_sketch:
1. Misalkan tinggi air `h` dan jari-jari permukaan air `r`.
2. Dari kesebangunan, `r/h=3/6=1/2`, jadi `r=h/2`.
3. Volume air `V=(1/3)\pi r^2h=(1/3)\pi(h^2/4)h=\pi h^3/12`.
4. Turunkan: `dV/dt=(\pi h^2/4) dh/dt`.
5. Saat `h=4`, `2=4\pi dh/dt`, sehingga `dh/dt=1/(2\pi)`.

## MF-PUR-0304

purcell_reference: Chapter 3, graphing functions using calculus  
chapter: Applications of the Derivative  
subtopic: Concavity and Inflection Points  
difficulty: Medium  
story_problem: false  
weakness_tags: ["second derivative", "concavity intervals", "inflection points"]  
recommendation_trigger: Learner uses first derivative for concavity instead of second derivative.  
question_display: `Untuk f(x)=x^4-4x^3, tentukan interval kecekungan dan titik beloknya.`  
question_text: Gunakan tanda turunan kedua.  
answer_display: `Cekung ke atas pada (-\infty,0)\cup(2,\infty), cekung ke bawah pada (0,2), titik belok x=0,2`  
solution_sketch:
1. `f'(x)=4x^3-12x^2`.
2. `f''(x)=12x^2-24x=12x(x-2)`.
3. Tanda `f''` positif pada `(-infinity,0)` dan `(2,infinity)`.
4. Tanda `f''` negatif pada `(0,2)`.
5. Karena tanda berubah di `0` dan `2`, keduanya titik belok.

## MF-PUR-0305

purcell_reference: Chapter 3, solving equations numerically  
chapter: Applications of the Derivative  
subtopic: Newton's Method  
difficulty: Medium  
story_problem: false  
weakness_tags: ["Newton method", "root approximation", "iteration formula"]  
recommendation_trigger: Learner knows derivative but cannot use it in an iterative approximation.  
question_display: `Gunakan metode Newton untuk mendekati \sqrt{5} dengan f(x)=x^2-5 dan tebakan awal x_0=2. Hitung x_1 dan x_2.`  
question_text: Terapkan rumus Newton x_{n+1}=x_n-f(x_n)/f'(x_n).  
answer_display: `x_1=2.25,\quad x_2\approx2.2361`  
solution_sketch:
1. `f(x)=x^2-5`, `f'(x)=2x`.
2. `x_1=2-(-1)/4=2.25`.
3. `f(2.25)=0.0625`, `f'(2.25)=4.5`.
4. `x_2=2.25-0.0625/4.5\approx2.2361`.

## MF-PUR-0404

purcell_reference: Chapter 4, mean value theorem for integrals  
chapter: The Definite Integral  
subtopic: Average Value of a Function  
difficulty: Easy  
story_problem: false  
weakness_tags: ["average value", "definite integral", "interval length"]  
recommendation_trigger: Learner computes total accumulation but forgets dividing by interval length.  
question_display: `Tentukan nilai rata-rata f(x)=x^2 pada interval [0,3].`  
question_text: Gunakan rumus nilai rata-rata fungsi pada interval.  
answer_display: `3`  
solution_sketch:
1. Nilai rata-rata: `f_avg = 1/(b-a) int_a^b f(x) dx`.
2. Di sini `b-a=3`.
3. `\int_0^3 x^2 dx = [x^3/3]_0^3=9`.
4. Nilai rata-rata `9/3=3`.

## MF-PUR-0405

purcell_reference: Chapter 4, numerical integration  
chapter: The Definite Integral  
subtopic: Simpson's Rule  
difficulty: Hard  
story_problem: false  
weakness_tags: ["Simpson rule", "numerical integration", "step size", "weighted sum"]  
recommendation_trigger: Learner mixes trapezoidal and Simpson weights.  
question_display: `Gunakan aturan Simpson dengan n=4 untuk mendekati \int_0^4\sqrt{1+x}\,dx.`  
question_text: Gunakan titik x=0,1,2,3,4 dan bobot Simpson 1-4-2-4-1.  
answer_display: `\dfrac{1+\sqrt5+4(\sqrt2+2)+2\sqrt3}{3}`  
solution_sketch:
1. `h=(4-0)/4=1`.
2. Nilai fungsi: `f_0=1`, `f_1=\sqrt2`, `f_2=\sqrt3`, `f_3=2`, `f_4=\sqrt5`.
3. Aturan Simpson: `(h/3)[f_0+4f_1+2f_2+4f_3+f_4]`.
4. Substitusi memberi ekspresi jawaban.

## MF-PUR-0504

purcell_reference: Chapter 5, length of a plane curve  
chapter: Applications of the Integral  
subtopic: Arc Length  
difficulty: Hard  
story_problem: false  
weakness_tags: ["arc length", "derivative inside integral", "radical simplification"]  
recommendation_trigger: Learner uses area formula instead of arc length formula.  
question_display: `Tentukan panjang kurva y=\dfrac{2}{3}x^{3/2} dari x=0 sampai x=3.`  
question_text: Gunakan rumus panjang kurva L = integral sqrt(1+(y')^2).  
answer_display: `\dfrac{14}{3}`  
solution_sketch:
1. `y'=\sqrt{x}`.
2. Panjang `L=\int_0^3\sqrt{1+x} dx`.
3. Antiturunan `\frac{2}{3}(1+x)^{3/2}`.
4. Evaluasi: `(2/3)(4^{3/2}-1)=(2/3)(8-1)=14/3`.

## MF-PUR-0505

purcell_reference: Chapter 5, work and fluid force  
chapter: Applications of the Integral  
subtopic: Fluid Force  
difficulty: Super Hard  
story_problem: true  
weakness_tags: ["fluid force", "pressure depth", "applied integration", "units"]  
recommendation_trigger: Learner treats pressure as constant even though depth changes.  
question_display: `Sebuah pintu air vertikal berbentuk persegi panjang lebarnya 4 m dan tingginya 3 m. Bagian atas pintu tepat di permukaan air. Jika berat jenis air 9800 N/m^3, hitung gaya total air pada pintu.`  
question_text: Tekanan air pada kedalaman y adalah 9800y, lalu integralkan sepanjang tinggi pintu.  
answer_display: `176400\text{ N}`  
solution_sketch:
1. Ambil `y` sebagai kedalaman dari permukaan air.
2. Tekanan pada kedalaman `y`: `p(y)=9800y`.
3. Irisan horizontal punya luas kecil `4 dy`.
4. Gaya kecil `dF=9800y*4 dy`.
5. Total `F=\int_0^3 39200y dy=39200(9/2)=176400`.

## MF-PUR-0604

purcell_reference: Chapter 6, inverse trigonometric functions and their derivatives  
chapter: Transcendental Functions  
subtopic: Inverse Trigonometric Derivatives  
difficulty: Medium  
story_problem: false  
weakness_tags: ["inverse trig derivative", "chain rule", "arctangent"]  
recommendation_trigger: Learner memorizes arctan derivative but misses the inner derivative.  
question_display: `Tentukan \dfrac{d}{dx}\arctan(3x^2).`  
question_text: Gunakan turunan arctan u dan aturan rantai.  
answer_display: `\dfrac{6x}{1+9x^4}`  
solution_sketch:
1. Untuk `y=\arctan u`, `y'=u'/(1+u^2)`.
2. Ambil `u=3x^2`.
3. `u'=6x` dan `u^2=9x^4`.
4. Maka turunan `6x/(1+9x^4)`.

## MF-PUR-0605

purcell_reference: Chapter 6, exponential growth and decay  
chapter: Transcendental Functions  
subtopic: Logistic Growth  
difficulty: Super Hard  
story_problem: true  
weakness_tags: ["logistic model", "differential equation", "carrying capacity", "initial condition"]  
recommendation_trigger: Learner uses unlimited exponential growth when a carrying capacity is stated.  
question_display: `Populasi bakteri mengikuti model logistik \dfrac{dP}{dt}=0.4P\left(1-\dfrac{P}{1000}\right), dengan P(0)=100. Tentukan P(t).`  
question_text: Gunakan bentuk solusi logistik dengan kapasitas tampung 1000.  
answer_display: `P(t)=\dfrac{1000}{1+9e^{-0.4t}}`  
solution_sketch:
1. Bentuk solusi logistik: `P(t)=K/(1+Ae^{-kt})`.
2. Di sini `K=1000` dan `k=0.4`.
3. Gunakan `P(0)=100`: `100=1000/(1+A)`.
4. Maka `1+A=10`, sehingga `A=9`.

## MF-PUR-0705

purcell_reference: Chapter 7, rationalizing substitutions  
chapter: Techniques of Integration  
subtopic: Inverse Trig Substitution Pattern  
difficulty: Medium  
story_problem: false  
weakness_tags: ["inverse trig integral", "radical denominator", "recognizing arcsine form"]  
recommendation_trigger: Learner tries power rule on a square-root denominator that needs inverse trig form.  
question_display: `Hitung \int \dfrac{dx}{\sqrt{9-x^2}}.`  
question_text: Cocokkan integran dengan bentuk turunan arcsin.  
answer_display: `\arcsin\left(\dfrac{x}{3}\right)+C`  
solution_sketch:
1. Bentuk standar: `\int dx/\sqrt{a^2-x^2}=\arcsin(x/a)+C`.
2. Di sini `a=3`.
3. Maka hasilnya `\arcsin(x/3)+C`.
4. Cek cepat: turunan `arcsin(x/3)` menghasilkan `1/\sqrt{9-x^2}`.

## MF-PUR-0706

purcell_reference: Chapter 7, basic integration rules and substitutions  
chapter: Techniques of Integration  
subtopic: Algebraic Substitution  
difficulty: Medium  
story_problem: false  
weakness_tags: ["u substitution", "algebra before integration", "radical integral"]  
recommendation_trigger: Learner substitutes but forgets rewriting every x in terms of u.  
question_display: `Hitung \int \dfrac{x}{\sqrt{x+1}}\,dx.`  
question_text: Gunakan u=x+1 sehingga x=u-1.  
answer_display: `\dfrac{2}{3}(x+1)^{3/2}-2\sqrt{x+1}+C`  
solution_sketch:
1. Ambil `u=x+1`, maka `x=u-1` dan `du=dx`.
2. Integral menjadi `\int (u-1)u^{-1/2}du`.
3. Sederhanakan: `\int (u^{1/2}-u^{-1/2})du`.
4. Hasil `(2/3)u^{3/2}-2u^{1/2}+C`.
5. Substitusi balik `u=x+1`.

## MF-PUR-0804

purcell_reference: Chapter 8, other indeterminate forms  
chapter: Indeterminate Forms and Improper Integrals  
subtopic: Growth Rates and L'Hopital  
difficulty: Medium  
story_problem: false  
weakness_tags: ["L'Hopital rule", "growth comparison", "log versus power"]  
recommendation_trigger: Learner cannot compare logarithmic growth with power growth.  
question_display: `Hitung \lim_{x\to\infty}\dfrac{\ln x}{x^{1/3}}.`  
question_text: Gunakan L'Hopital untuk bentuk tak tentu infinity/infinity.  
answer_display: `0`  
solution_sketch:
1. Bentuknya `infinity/infinity`.
2. Turunkan pembilang dan penyebut.
3. Limit menjadi `(1/x)/((1/3)x^{-2/3})=3/x^{1/3}`.
4. Saat `x -> infinity`, hasilnya 0.

## MF-PUR-0805

purcell_reference: Chapter 8, improper integrals with infinite limits  
chapter: Indeterminate Forms and Improper Integrals  
subtopic: Logarithmic Improper Integrals  
difficulty: Hard  
story_problem: false  
weakness_tags: ["improper integral", "log substitution", "convergence", "infinite interval"]  
recommendation_trigger: Learner misses substitution `u=ln x` in integrals containing `dx/x`.  
question_display: `Hitung \int_2^\infty \dfrac{1}{x(\ln x)^2}\,dx.`  
question_text: Gunakan substitusi u=ln x dan batas tak hingga.  
answer_display: `\dfrac{1}{\ln 2}`  
solution_sketch:
1. Ambil `u=\ln x`, maka `du=dx/x`.
2. Batas berubah dari `x=2` menjadi `u=\ln2`, dan `x=\infty` menjadi `u=\infty`.
3. Integral menjadi `\int_{\ln2}^{\infty}u^{-2}du`.
4. Antiturunan `-1/u`, sehingga nilai `0-(-1/\ln2)=1/\ln2`.

## MF-PUR-0905

purcell_reference: Chapter 9, power series  
chapter: Infinite Series  
subtopic: Radius and Interval of Convergence  
difficulty: Hard  
story_problem: false  
weakness_tags: ["power series", "radius of convergence", "endpoint testing", "ratio test"]  
recommendation_trigger: Learner finds radius but forgets endpoint behavior.  
question_display: `Tentukan interval konvergensi deret \sum_{n=1}^{\infty} n\left(\dfrac{x-2}{5}\right)^n.`  
question_text: Gunakan uji rasio lalu cek endpoint.  
answer_display: `(-3,7)`  
solution_sketch:
1. Rasio dominan memberi syarat `|(x-2)/5|<1`.
2. Maka `-5<x-2<5`, jadi `-3<x<7`.
3. Di `x=7`, suku menjadi `n`, tidak menuju 0.
4. Di `x=-3`, suku menjadi `n(-1)^n`, juga tidak menuju 0.
5. Interval konvergensi `(-3,7)`.

## MF-PUR-0906

purcell_reference: Chapter 9, Taylor and Maclaurin series  
chapter: Infinite Series  
subtopic: Alternating Series Approximation  
difficulty: Medium  
story_problem: false  
weakness_tags: ["Maclaurin series", "alternating error bound", "log approximation"]  
recommendation_trigger: Learner uses decimal approximation without controlling error.  
question_display: `Gunakan tiga suku pertama deret \ln(1+x) untuk mendekati \ln(1.2), dan beri batas galat sederhana.`  
question_text: Pakai deret ln(1+x)=x-x^2/2+x^3/3-... dengan x=0.2.  
answer_display: `0.182666\ldots,\quad |R|<0.0004`  
solution_sketch:
1. Untuk `x=0.2`, tiga suku pertama: `0.2-(0.2)^2/2+(0.2)^3/3`.
2. Nilainya `0.2-0.02+0.002666...=0.182666...`.
3. Karena deret berganti tanda dan menurun, galat kurang dari suku berikutnya.
4. Suku berikutnya `(0.2)^4/4=0.0004`.

## MF-PUR-1003

purcell_reference: Chapter 10, ellipses and hyperbolas  
chapter: Conics and Polar Coordinates  
subtopic: Ellipse Form  
difficulty: Medium  
story_problem: false  
weakness_tags: ["ellipse standard form", "center identification", "semi-axis length"]  
recommendation_trigger: Learner reads denominators as full axis lengths instead of squared semi-axis lengths.  
question_display: `Identifikasi pusat dan panjang semi-sumbu dari \dfrac{(x-2)^2}{9}+\dfrac{(y+1)^2}{4}=1.`  
question_text: Baca bentuk standar elips.  
answer_display: `Pusat (2,-1), semi-sumbu horizontal 3, semi-sumbu vertikal 2`  
solution_sketch:
1. Bentuk standar elips: `(x-h)^2/a^2+(y-k)^2/b^2=1`.
2. Pusatnya `(h,k)=(2,-1)`.
3. Penyebut 9 berarti semi-sumbu horizontal `3`.
4. Penyebut 4 berarti semi-sumbu vertikal `2`.

## MF-PUR-1004

purcell_reference: Chapter 10, calculus in polar coordinates  
chapter: Conics and Polar Coordinates  
subtopic: Tangent Slope in Polar Coordinates  
difficulty: Hard  
story_problem: false  
weakness_tags: ["polar derivative", "parametric slope", "tangent line"]  
recommendation_trigger: Learner differentiates r only and treats it as dy/dx.  
question_display: `Untuk kurva polar r=1+\cos\theta, tentukan kemiringan garis singgung saat \theta=\dfrac{\pi}{2}.`  
question_text: Gunakan x=r cos theta dan y=r sin theta.  
answer_display: `1`  
solution_sketch:
1. `r=1+\cos\theta`, sehingga `r'=-\sin\theta`.
2. `dx/dtheta=r'\cos\theta-r\sin\theta`.
3. `dy/dtheta=r'\sin\theta+r\cos\theta`.
4. Saat `theta=pi/2`, `r=1`, `r'=-1`.
5. `dx/dtheta=-1`, `dy/dtheta=-1`, jadi `dy/dx=1`.

## MF-PUR-1103

purcell_reference: Chapter 11, cross product  
chapter: Geometry in Space and Vectors  
subtopic: Cross Product  
difficulty: Medium  
story_problem: false  
weakness_tags: ["cross product", "determinant setup", "orthogonal vector"]  
recommendation_trigger: Learner mixes up signs in the middle component of a cross product.  
question_display: `Hitung a\times b untuk a=\langle1,2,3\rangle dan b=\langle2,-1,4\rangle.`  
question_text: Gunakan determinan komponen vektor.  
answer_display: `\langle11,2,-5\rangle`  
solution_sketch:
1. Komponen pertama: `2(4)-3(-1)=11`.
2. Komponen kedua: `-(1(4)-3(2))=2`.
3. Komponen ketiga: `1(-1)-2(2)=-5`.
4. Jadi `a\times b=\langle11,2,-5\rangle`.

## MF-PUR-1104

purcell_reference: Chapter 11, lines and tangent lines in three-space  
chapter: Geometry in Space and Vectors  
subtopic: Lines in Three-Space  
difficulty: Easy  
story_problem: false  
weakness_tags: ["3D line equation", "direction vector", "parametric form"]  
recommendation_trigger: Learner has a point and direction vector but cannot write the parametric line.  
question_display: `Tulis persamaan garis melalui P(1,-2,0) yang sejajar dengan v=\langle3,1,-4\rangle.`  
question_text: Gunakan r(t)=P+tv.  
answer_display: `\mathbf{r}(t)=\langle1,-2,0\rangle+t\langle3,1,-4\rangle`  
solution_sketch:
1. Garis dalam ruang ditentukan oleh satu titik dan satu vektor arah.
2. Titik awal `P=\langle1,-2,0\rangle`.
3. Vektor arah `v=\langle3,1,-4\rangle`.
4. Maka `r(t)=P+tv`.

## MF-PUR-1204

purcell_reference: Chapter 12, tangent planes and approximations  
chapter: Derivatives for Functions of Two or More Variables  
subtopic: Tangent Planes  
difficulty: Medium  
story_problem: false  
weakness_tags: ["tangent plane", "partial derivatives", "linearization"]  
recommendation_trigger: Learner computes partials but does not assemble the tangent plane equation.  
question_display: `Tentukan bidang singgung permukaan z=x^2+xy di titik (1,2,3).`  
question_text: Gunakan z-z0 = fx(x0,y0)(x-x0)+fy(x0,y0)(y-y0).  
answer_display: `z-3=4(x-1)+(y-2)`  
solution_sketch:
1. `f_x=2x+y`, sehingga `f_x(1,2)=4`.
2. `f_y=x`, sehingga `f_y(1,2)=1`.
3. Titik permukaan adalah `(1,2,3)`.
4. Bidang singgung: `z-3=4(x-1)+1(y-2)`.

## MF-PUR-1205

purcell_reference: Chapter 12, maxima and minima  
chapter: Derivatives for Functions of Two or More Variables  
subtopic: Constrained Extrema  
difficulty: Hard  
story_problem: false  
weakness_tags: ["constrained extrema", "circle constraint", "Lagrange intuition"]  
recommendation_trigger: Learner optimizes `xy` without using the constraint.  
question_display: `Tentukan nilai maksimum dan minimum f(x,y)=xy pada lingkaran x^2+y^2=8.`  
question_text: Gunakan simetri atau Lagrange multiplier.  
answer_display: `Maksimum 4, minimum -4`  
solution_sketch:
1. Identitas `(x-y)^2>=0` memberi `2xy <= x^2+y^2=8`, jadi `xy<=4`.
2. Kesamaan terjadi saat `x=y`, yaitu `(2,2)` dan `(-2,-2)`.
3. Identitas `(x+y)^2>=0` memberi `-2xy <= 8`, jadi `xy>=-4`.
4. Minimum terjadi saat `x=-y`, yaitu `(2,-2)` dan `(-2,2)`.

## MF-PUR-1304

purcell_reference: Chapter 13, change of variables in multiple integrals  
chapter: Multiple Integrals  
subtopic: Change of Variables  
difficulty: Hard  
story_problem: false  
weakness_tags: ["change of variables", "Jacobian", "parallelogram region"]  
recommendation_trigger: Learner changes variables but forgets the Jacobian determinant.  
question_display: `Dengan x=u+v dan y=u-v, hitung \iint_R (x+y)\,dA jika 0\le u\le1 dan 0\le v\le2.`  
question_text: Ubah integran dan luas elemen menggunakan Jacobian.  
answer_display: `4`  
solution_sketch:
1. `x+y=(u+v)+(u-v)=2u`.
2. Jacobian `|\partial(x,y)/\partial(u,v)|=|-2|=2`.
3. Integral menjadi `\int_0^1\int_0^2 2u*2\,dv\,du`.
4. `\int_0^1\int_0^2 4u\,dv\,du=4`.

## MF-PUR-1305

purcell_reference: Chapter 13, surface area  
chapter: Multiple Integrals  
subtopic: Surface Area  
difficulty: Medium  
story_problem: false  
weakness_tags: ["surface area", "partial derivatives", "surface over rectangle"]  
recommendation_trigger: Learner computes projected area but misses the surface stretch factor.  
question_display: `Tentukan luas permukaan z=3x+4y di atas persegi 0\le x\le1, 0\le y\le1.`  
question_text: Gunakan rumus luas permukaan z=f(x,y).  
answer_display: `\sqrt{26}`  
solution_sketch:
1. Untuk `z=f(x,y)`, luas permukaan `\iint_R sqrt(1+f_x^2+f_y^2)dA`.
2. `f_x=3`, `f_y=4`.
3. Faktor luas `sqrt(1+9+16)=sqrt26`.
4. Luas proyeksi persegi adalah 1, jadi total `sqrt26`.

## MF-PUR-1404

purcell_reference: Chapter 14, independence of path  
chapter: Vector Calculus  
subtopic: Conservative Vector Fields  
difficulty: Medium  
story_problem: false  
weakness_tags: ["conservative field", "potential function", "path independence"]  
recommendation_trigger: Learner computes line integrals directly without checking if a potential function exists.  
question_display: `Tunjukkan bahwa \mathbf{F}=\langle2xy,x^2+3y^2\rangle konservatif dan tentukan fungsi potensialnya.`  
question_text: Cek kesamaan turunan silang lalu integralkan komponen pertama.  
answer_display: `\phi(x,y)=x^2y+y^3+C`  
solution_sketch:
1. `P=2xy`, `Q=x^2+3y^2`.
2. `P_y=2x` dan `Q_x=2x`, jadi field konservatif pada bidang.
3. Integralkan `P` terhadap `x`: `\phi=x^2y+g(y)`.
4. Turunan terhadap `y`: `\phi_y=x^2+g'(y)=x^2+3y^2`.
5. Maka `g(y)=y^3+C`.

## MF-PUR-1405

purcell_reference: Chapter 14, Stokes's theorem  
chapter: Vector Calculus  
subtopic: Stokes's Theorem  
difficulty: Super Hard  
story_problem: true  
weakness_tags: ["Stokes theorem", "circulation", "curl", "disk surface", "orientation"]  
recommendation_trigger: Learner parameterizes a circular boundary directly instead of using curl over the disk.  
question_display: `Medan rotasi ideal \mathbf{F}=\langle-y/2,x/2,0\rangle mengelilingi tepi disk radius R pada bidang xy, berorientasi berlawanan arah jarum jam dilihat dari atas. Hitung sirkulasi \oint_C \mathbf{F}\cdot d\mathbf{r}.`  
question_text: Gunakan Teorema Stokes dengan normal ke atas.  
answer_display: `\pi R^2`  
solution_sketch:
1. Curl dari `F` adalah `\nabla\times F=\langle0,0,1\rangle`.
2. Dengan normal ke atas, `(\nabla\times F)\cdot n=1`.
3. Teorema Stokes mengubah sirkulasi menjadi integral luas atas disk.
4. Luas disk radius `R` adalah `\pi R^2`, jadi sirkulasinya `\pi R^2`.

---

## Import Notes

Before turning these entries into live Mafiking problems:

1. Convert `Super Hard` to `Hard` or extend the DB/UI difficulty enum.
2. Add complete `problem_steps` with `title`, `content`, `why`, `intuition`, `mistakes`, and `mistake_result`.
3. Keep `purcell_reference` as metadata outside the student-facing copied text. Student-facing source text can say: `Topik selaras dengan Purcell Calculus, Bab X`.
4. Do not add exact Purcell exercise text unless you have written permission or a license.
