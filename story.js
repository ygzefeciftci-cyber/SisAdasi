// Sis Adası — hikaye verisi. Oyun mantığı server.js'de, burada sadece içerik var.
// Yeni sahne eklemek için `scenes` içine bir anahtar ekleyip bir seçeneğin `to` alanına yazman yeterli.
//
// Sahne alanları:
//   title, text (paragraflar \n\n ile ayrılır), extra: [{flag, text}] (bayrak varsa eklenir)
//   choices: [{ text, to, result?, set?: [bayrak], needs?: rol, needsFlag?: bayrak }]
//   ending: true  -> oyun biter, endingTitle gösterilir
//   pickPlayer: true -> sahneye girerken rastgele bir oyuncu seçilir, metinde {kalan} olarak geçer

module.exports = {
  start: 'baslangic',
  maxPlayers: 4,

  roles: {
    kaptan:   { name: 'Kaptan',   icon: '⚓', blurb: 'Soğukkanlı lider. Oylar berabere kalırsa son sözü o söyler.' },
    muhendis: { name: 'Mühendis', icon: '🔧', blurb: 'Makineleri ve eski fener mekanizmasını anlar.' },
    doktor:   { name: 'Doktor',   icon: '🩺', blurb: 'İzleri, yaraları ve korkuyu okur.' },
    gazeteci: { name: 'Gazeteci', icon: '🎙️', blurb: 'Sesleri çözer, insanları konuşturur.' },
  },
  roleOrder: ['kaptan', 'muhendis', 'doktor', 'gazeteci'],

  flagHints: {
    gunluk: 'bekçinin defteri',
  },

  scenes: {
    baslangic: {
      title: 'Sis',
      text:
        'Gece yarısı. Feribot Martı, Karabatak Adası’nın açıklarında bir anda sisin içine giriyor. Motor öksürüyor, sonra tamamen susuyor. Pusulanın iğnesi çılgınca dönüyor.\n\n' +
        'Sisin içinde, otuz yıldır terk edilmiş olması gereken fenerden zayıf bir ışık yanıp sönüyor. Tayfa Selim küpeşteden eğilmiş, ışığa bakıyor. “Ben bunu daha önce gördüm,” diyor. “Dedem anlatırdı.”',
      choices: [
        { text: 'Filikayı indirip adaya çıkın', to: 'iskele', result: 'Filikayı suya indirdiniz. Sis, kürek seslerinizi yutuyor.' },
        { text: 'Telsizle yardım çağırın', to: 'telsiz', result: 'Telsizin düğmesine bastınız.' },
        { text: 'Motoru onarmayı deneyin', to: 'motor', needs: 'muhendis', result: 'Mühendis motor bölmesine indi.' },
      ],
    },

    telsiz: {
      title: 'Cızırtı',
      text:
        'Cızırtının arasından çocuksu, yorgun bir ses geliyor: “Işığı takip etmeyin. Bir kere takip eden geri dönemiyor.” Hat kesiliyor.\n\nSelim’in yüzü bembeyaz oldu.',
      choices: [
        { text: 'Sesi analiz edin: nereden geliyor?', to: 'ses', needs: 'gazeteci', result: 'Gazeteci kayıt cihazını telsize bağladı.' },
        { text: 'Uyarıyı dinleyin, sabaha kadar bekleyin', to: 'bekle', result: 'Demir attınız ve nöbet sırası yaptınız.' },
        { text: 'Yine de ışığa doğru kürek çekin', to: 'iskele', set: ['warned'], result: 'Uyarıyı duymazdan geldiniz.' },
      ],
    },

    ses: {
      title: 'Kaydın Altındaki Ses',
      text:
        'Gazeteci kaydı yavaşlatıyor. Çocuk sesinin altında başka bir ses var: yavaş, tekrarlayan bir çan. Çan fenerin içinden geliyor.\n\nKayıtta kısa bir cümle seçiliyor: “Üçüncü yol var.”',
      choices: [
        { text: 'Çanın peşinden adaya çıkın', to: 'iskele', set: ['ses'], result: 'Çanın ritmine göre kürek çektiniz.' },
        { text: 'Hâlâ güvendeyiz, sabaha kadar bekleyin', to: 'bekle', result: 'Kaydı kapattınız.' },
      ],
    },

    motor: {
      title: 'Tuzlu Kablo',
      text:
        'Yakıt hattı sağlam. Ama ateşleme kablosu temiz biçimde kesilmiş, kesik yeri tuzla kaplı; sanki yıllarca suyun altında kalmış gibi. Gemi bu gece kıpırdamayacak.',
      choices: [
        { text: 'Filikayla adaya çıkın', to: 'iskele', set: ['motor_bozuk'], result: 'Motoru bıraktınız.' },
        { text: 'Sabaha kadar bekleyin', to: 'bekle', result: 'Motor bölmesinin kapağını kapattınız.' },
      ],
    },

    bekle: {
      title: 'Nöbet',
      text:
        'Nöbet sırayla tutuluyor. Saat üçe doğru sis güvertenin üzerine kalkıyor ve tüm sesleri alıyor. Sonra fenerden bir çan sesi geliyor.\n\nSelim uykusunda kalkmış gibi iskele tarafına yürüyor; gözleri açık ama hiçbir şeye bakmıyor.',
      choices: [
        { text: 'Selim’i bileğinden tutup durdurun', to: 'iskele', set: ['selim'], result: 'Selim’i tuttunuz. Sis sizi de çekiyor, filika kendiliğinden kıyıya süzülüyor.' },
        { text: 'Kapıları kilitleyin, kimse güverteden çıkmasın', to: 'son_sis', result: 'Kapıları kilitlediniz.' },
      ],
    },

    iskele: {
      title: 'Çürük İskele',
      text:
        'Filika kıyıya sürtünüyor. İskele çürümüş, ama havada taze fener yağı kokusu var. Sağda bekçi kulübesi, ileride taş merdivenli fener. Kumda ayak izleri uzanıyor; hepsi denize doğru.',
      extra: [
        { flag: 'warned', text: 'Telsizdeki çocuk sesi hâlâ kulağınızda çınlıyor.' },
        { flag: 'selim', text: 'Selim yanınızda sessizce duruyor; elinizi bırakmıyor.' },
        { flag: 'motor_bozuk', text: 'Uzakta, sisin içinde Martı’nın siluetini zor seçiyorsunuz.' },
      ],
      choices: [
        { text: 'Bekçi kulübesine girin', to: 'kulube', result: 'Kulübenin kapısı gıcırdayarak açıldı.' },
        { text: 'Kumdaki izleri inceleyin', to: 'iz', needs: 'doktor', result: 'Doktor kumun üstüne çömeldi.' },
        { text: 'Doğrudan fenere yürüyün', to: 'fener', result: 'Taş merdivenlere yöneldiniz.' },
      ],
    },

    kulube: {
      title: 'Ilık Çay',
      text:
        'Kulübenin içi dün terk edilmiş gibi: çay hâlâ ılık. Masada bir defter açık duruyor:\n\n“Işığı SÖNDÜRMEYİN. Sis ışıkla beslenmiyor, ışık onu tutuyor. Ama ışık yaşlandı. Ya yeni bir bekçi gerek, ya da yeni bir mercek.”',
      set: ['gunluk'],
      choices: [
        { text: 'Defteri alıp fenere çıkın', to: 'fener', set: ['gunluk'], result: 'Defteri çantaya koydunuz.' },
      ],
    },

    iz: {
      title: 'Çıplak Ayaklar',
      text:
        '“Çıplak ayak,” diyor Doktor. “Ve hepsi aynı kişiye ait değil: bir çocuk, bir yaşlı, bir kadın… Hepsi denize yürümüş. Hiçbiri geri dönmemiş.”\n\nKısa, derin bir iz daha var: ağır bir anahtarın sürüklenme izi, kulübeye doğru.',
      choices: [
        { text: 'Anahtarın izini takip edin', to: 'kulube', result: 'İzi kulübeye kadar sürdünüz.' },
        { text: 'Fenere çıkın', to: 'fener', result: 'Merdivenlere yöneldiniz.' },
      ],
    },

    fener: {
      title: 'Mercek',
      text:
        'Spiral merdivenden çıkıyorsunuz; her basamakta sis biraz daha seyreliyor. Tepede, dev merceğin altında beyaz saçlı biri sırtı dönük oturuyor. Lamba cılız yanıyor; ışık her titrediğinde dışarıdaki sis kıyıya bir adım daha yaklaşıyor.',
      extra: [
        { flag: 'gunluk', text: 'Defterdeki el yazısı, bu adamın elinden çıkmış gibi.' },
        { flag: 'ses', text: 'Kayıttaki “üçüncü yol” cümlesi aklınızdan çıkmıyor.' },
      ],
      choices: [
        { text: 'Bekçiyle konuşun', to: 'bekci', result: 'Bekçi yavaşça döndü.' },
        { text: 'Merceği defterdeki çizimlere göre onarın', to: 'son_isik', needs: 'muhendis', needsFlag: 'gunluk', result: 'Mühendis defteri açıp işe koyuldu.' },
        { text: 'Lambayı hemen söndürün', to: 'son_karanlik', result: 'Elinizi şalterin üstüne koydunuz.' },
        { text: 'Geri çekilin, filikaya dönün', to: 'son_kacis', result: 'Merdivenden koşarak indiniz.' },
      ],
    },

    bekci: {
      title: 'Haldun',
      text:
        'Bekçi dönüyor: yüzü yorgun ama sakin. “Ben Haldun. Sisi otuz yıldır bu merceğin içinde tutuyorum. Işık bir kapıdır, evlat. Söndürürseniz kapı açılır, sis kıyıya çıkar. Yanarsa gemileri çeker. Üçüncü yol: kapıyı içeriden tutacak biri.”\n\nElini göğsüne koyuyor. “Ben yoruldum.”',
      choices: [
        { text: 'Biri bekçinin yerine kalsın', to: 'son_fedakar', result: 'Kimse hemen cevap vermedi.' },
        { text: 'Merceği onarın: ışık gemileri değil, sisi tutsun', to: 'son_isik', needs: 'muhendis', result: 'Mühendis mercekle uğraşmaya başladı.' },
        { text: 'Lambayı söndürün', to: 'son_karanlik', result: 'Haldun başını eğdi.' },
        { text: 'Haldun’u da alıp kaçın', to: 'son_kacis', result: 'Haldun’un koluna girdiniz.' },
      ],
    },

    // ---- Sonlar ----

    son_sis: {
      title: 'Sis Sabırlıdır',
      ending: true,
      endingTitle: 'SON: Sis Sabırlıdır',
      text:
        'Sabah olduğunda Martı sisin içinde tek başına sürükleniyor. Güvertedeki çaylar soğumuş, filika yerinde… ve kimse yok. Balıkçılar gemiyi öğlen buluyor.\n\nPusula yine çılgınca dönüyor, ama bu kez iğne fenere değil, doğrudan size bakıyor.',
    },

    son_kacis: {
      title: 'Yarım Kalan Kaçış',
      ending: true,
      endingTitle: 'SON: Yarım Kalan Kaçış',
      text:
        'Filikayı iteleyip sisten kaçıyorsunuz. Sabaha doğru feribotun motoru kendiliğinden çalışıyor. Limana varıyorsunuz; herkes hayatta.\n\nAma o gecenin sonunda Karabatak Adası’nın ışığı bir kez daha yanıp sönüyor. Ertesi hafta, başka bir geminin telsizinden aynı çocuk sesi duyuluyor.',
    },

    son_karanlik: {
      title: 'Karanlık Barış',
      ending: true,
      endingTitle: 'SON: Karanlık Barış',
      text:
        'Lambayı söndürüyorsunuz. Mercek bir iç çekişle kararıyor. Sis bir an sessizce bekliyor, sonra kıyıdan, gemilerden, adadan çekilip denizin üstünde yağmur olup dökülüyor.\n\nAda artık sadece bir ada. Ama pusulanın iğnesi bir daha kuzeyi bulmuyor.',
    },

    son_isik: {
      title: 'Yeni Işık',
      ending: true,
      endingTitle: 'SON: Yeni Işık',
      text:
        'Mühendis merceği yeniden diziyor. Işık yeniden yandığında ilk kez düz, sıcak, altın renkte: gemileri çekmiyor, onlara yol gösteriyor. Sis kıyıdan çekiliyor ve Haldun’un omuzlarından yıllardır taşıdığı yük kalkıyor.\n\nSabaha doğru Martı’nın motoru kendiliğinden çalışıyor. Fener, siz uzaklaşırken bile yanmaya devam ediyor.',
    },

    son_fedakar: {
      title: 'Yeni Bekçi',
      ending: true,
      pickPlayer: true,
      endingTitle: 'SON: Yeni Bekçi',
      text:
        'Merdivenin başında {kalan} duruyor. “Ben kalırım,” diyor. Haldun anahtarı ona uzatıyor. Işık güçleniyor, sis geri çekiliyor.\n\nSabah filika sizi gemiye götürürken fenerden bir el sallanıyor. Her yıl aynı gün Martı adanın önünden geçiyor ve fener üç kez yanıp sönüyor, bir selam gibi.',
    },
  },
};
