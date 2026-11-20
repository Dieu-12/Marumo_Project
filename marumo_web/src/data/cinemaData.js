export const formatLabels = {
  All: 'Tất cả định dạng',
  'IMAX Laser': 'IMAX Laser',
  'Dolby Atmos': 'Dolby Atmos',
  '2D Sub': '2D phụ đề',
  '2D Dub': '2D lồng tiếng',
  '4DX': '4DX',
  'VIP Lounge': 'Phòng chờ VIP',
  'Couple Suites': 'Phòng đôi',
  'Gold Class': 'Hạng thương gia',
  'Family Hall': 'Phòng gia đình',
};

export const MOVIES = [
  {
    id: 'solar-odyssey',
    slug: 'solar-odyssey-horizon',
    title: 'Hành trình Mặt Trời: Chân trời',
    status: 'now-showing',
    genre: 'Khoa học viễn tưởng / Phiêu lưu',
    genreKey: 'Sci-Fi',
    duration: 148,
    ageRating: 'T13',
    rating: 9.1,
    releaseDate: '2026-11-06',
    releaseLabel: '06/11/2026',
    director: 'Kenji Takahashi',
    cast: ['Elena Vance', 'Marcus Chen', 'Sora Lindqvist', 'David Okafor'],
    language: 'Tiếng Anh · Phụ đề tiếng Việt',
    formats: ['IMAX Laser', 'Dolby Atmos', '2D Sub'],
    isFeaturedHero: true,
    heroTagline: 'Khám phá vũ trụ trên màn hình IMAX',
    heroDescription:
      'Khi một tín hiệu yếu vang lên từ vành đai ngoài của Sao Thổ, chỉ huy Elena Vance dẫn đội trinh sát bốn người vượt qua ranh giới Hệ Mặt Trời.',
    synopsis:
      'Năm 2049, chỉ huy Elena Vance cùng phi hành đoàn quốc tế bắt đầu chuyến thám hiểm kéo dài 19 tháng sau khi các cảm biến phát hiện một tín hiệu nhân tạo quanh Enceladus. Giữa không gian bao la, họ phải dựa vào lòng can đảm và sự gắn kết để tiếp tục hành trình.',
    heroImage: '/src/assets/images/hero_solar_odyssey_1794993127719.jpg',
    posterImage: '/src/assets/images/poster_solar_odyssey_1794993128134.jpg',
    trailerLength: '2:24',
  },
  {
    id: 'velvet-syndicate',
    slug: 'the-velvet-syndicate',
    title: 'Tổ chức Nhung đen',
    status: 'now-showing',
    genre: 'Tội phạm / Giật gân',
    genreKey: 'Thriller',
    duration: 126,
    ageRating: 'T16',
    rating: 8.7,
    releaseDate: '2026-11-12',
    releaseLabel: '12/11/2026',
    director: 'Minh Nguyen',
    cast: ['Haruto Sato', 'Clara Moreau', 'Victor Hale', 'Linh Tran'],
    language: 'Tiếng Nhật và tiếng Anh · Phụ đề tiếng Việt',
    formats: ['Dolby Atmos', '2D Sub'],
    isFeaturedHero: true,
    heroTagline: 'Đang chiếu với âm thanh Dolby Atmos',
    heroDescription:
      'Trong một đêm mưa ở Tokyo, một kiểm toán viên điều tra phát hiện cuốn sổ nối liền năm khách sạn sang trọng với một tổ chức đang biến mất.',
    synopsis:
      'Điều tra viên Ren Kuroda chỉ có 36 giờ để tìm một người chuyển giao công hàm mất tích trước khi hội nghị quốc tế bắt đầu. Qua những quảng trường ướt mưa và sảnh khách sạn cẩm thạch, từng manh mối kéo anh sâu hơn vào mạng lưới bí ẩn của Tổ chức Nhung đen.',
    heroImage: '/src/assets/images/hero_velvet_syndicate_1794993127890.jpg',
    posterImage: '/src/assets/images/poster_velvet_syndicate_1794993129750.jpg',
    trailerLength: '2:08',
  },
  {
    id: 'starlight-symphony',
    slug: 'starlight-symphony',
    title: 'Giao hưởng Ánh sao',
    status: 'now-showing',
    genre: 'Hoạt hình / Gia đình',
    genreKey: 'Animation',
    duration: 108,
    ageRating: 'P',
    rating: 9.3,
    releaseDate: '2026-11-14',
    releaseLabel: '14/11/2026',
    director: 'Claire Dubois',
    cast: ['Maya Lin (lồng tiếng)', 'Leo Park (lồng tiếng)', 'Hana Mori (lồng tiếng)'],
    language: 'Lồng tiếng Việt / Bản gốc có phụ đề',
    formats: ['IMAX Laser', '2D Dub', '2D Sub'],
    isFeaturedHero: true,
    heroTagline: 'Cuộc phiêu lưu âm nhạc cho cả gia đình',
    heroDescription:
      'Một cô bé chơi vĩ cầm và người bạn biểu diễn đường phố đánh thức những chú hạc giấy vàng trong đài thiên văn để mang âm nhạc trở lại thị trấn ven biển.',
    synopsis:
      'Trên bến cảng rực sáng đèn lồng là đài thiên văn bỏ hoang, nơi tiếng chuông gió từng dẫn tàu về nhà. Khi Aria, cô bé mười hai tuổi, tìm thấy chiếc chìa khóa đồng trong hộp đàn của ông, từng nốt nhạc em chơi khiến mây trời bừng lên sắc màu.',
    heroImage: '/src/assets/images/hero_starlight_symphony_1794993128411.jpg',
    posterImage: '/src/assets/images/poster_starlight_symphony_1794993129599.jpg',
    trailerLength: '1:56',
  },
  {
    id: 'apex-protocol',
    slug: 'apex-protocol',
    title: 'Mật lệnh Đỉnh cao',
    status: 'now-showing',
    genre: 'Hành động / Đua xe',
    genreKey: 'Action',
    duration: 134,
    ageRating: 'T13',
    rating: 8.8,
    releaseDate: '2026-11-01',
    releaseLabel: '01/11/2026',
    director: 'Julian Mercer',
    cast: ['Mateo Silva', 'Liam Thorne', 'Yuna Kwon', 'Arjun Mehta'],
    language: 'Tiếng Anh · Phụ đề tiếng Việt',
    formats: ['4DX', 'IMAX Laser', '2D Sub'],
    isFeaturedHero: false,
    heroTagline: 'Cảm nhận từng khúc cua cùng 4DX',
    heroDescription:
      'Một đội kỹ sư ít tên tuổi đặt cược tất cả vào chiếc xe thử nghiệm trong cuộc đua sức bền 24 giờ dọc bờ biển.',
    synopsis:
      'Sau vụ rò rỉ dữ liệu khiến đội đua bị loại, kỹ sư Nadia Kwon và tay đua kỳ cựu Mateo Silva chỉ có mười bốn ngày để chế tạo lại chiếc xe sợi carbon. Họ trở lại giải đua sức bền qua những cung đường phố và đường hầm để giành lấy cơ hội cuối cùng.',
    heroImage: '/src/assets/images/poster_apex_protocol_1794993131373.jpg',
    posterImage: '/src/assets/images/poster_apex_protocol_1794993131373.jpg',
    trailerLength: '2:15',
  },
  {
    id: 'letters-in-monsoon',
    slug: 'letters-in-monsoon',
    title: 'Những lá thư mùa mưa',
    status: 'coming-soon',
    genre: 'Tình cảm / Tâm lý',
    genreKey: 'Drama',
    duration: 118,
    ageRating: 'T13',
    rating: null,
    releaseDate: '2026-11-27',
    releaseLabel: '27/11/2026',
    director: 'An Hoang',
    cast: ['Thao Vy', 'Quang Minh', 'Binh An'],
    language: 'Tiếng Việt · Phụ đề tiếng Anh',
    formats: ['2D Sub'],
    isFeaturedHero: false,
    heroTagline: 'Khởi chiếu ngày 27/11',
    heroDescription:
      'Hai sinh viên kiến trúc tìm lại nhau qua những tấm bưu thiếp bị lãng quên trong một tiệm sách cũ ở Sài Gòn.',
    synopsis:
      'Giữa mùa mưa cuối thu ở Sài Gòn, chuyên viên trùng tu kiến trúc Khánh phát hiện một xấp bưu thiếp chưa gửi từ bảy năm trước. Hành trình tìm người viết mở ra những ký ức cũ và cơ hội để họ bắt đầu lại.',
    heroImage: '/src/assets/images/poster_letters_monsoon_1794993130791.jpg',
    posterImage: '/src/assets/images/poster_letters_monsoon_1794993130791.jpg',
    trailerLength: '2:02',
  },
  {
    id: 'the-glass-orchard',
    slug: 'the-glass-orchard',
    title: 'Khu vườn Thủy tinh',
    status: 'coming-soon',
    genre: 'Bí ẩn / Giật gân',
    genreKey: 'Thriller',
    duration: 122,
    ageRating: 'T16',
    rating: null,
    releaseDate: '2026-12-04',
    releaseLabel: '04/12/2026',
    director: 'Nora Lindholm',
    cast: ['Freja Holm', 'Daniel Cho', 'Klara Weiss'],
    language: 'Tiếng Anh · Phụ đề tiếng Việt',
    formats: ['Dolby Atmos', '2D Sub'],
    isFeaturedHero: false,
    heroTagline: 'Khởi chiếu ngày 04/12',
    heroDescription:
      'Được mời lập danh mục hoa trà quý trong nhà kính trên núi, một nhà thực vật học khám phá vụ mất tích từ nhiều thập kỷ trước.',
    synopsis:
      'Giữa cao nguyên phủ sương là một nhà kính cổ đã đóng cửa suốt ba mươi năm. Khi nhà thực vật học Astrid Solberg bước vào ghi chép mùa hoa đông, mỗi mẫu cây lại hé lộ một manh mối được giấu kín.',
    heroImage: '/src/assets/images/poster_glass_orchard_1794993131257.jpg',
    posterImage: '/src/assets/images/poster_glass_orchard_1794993131257.jpg',
    trailerLength: '2:18',
  },
  {
    id: 'orbital-nine',
    slug: 'orbital-nine',
    title: 'Trạm quỹ đạo Số Chín',
    status: 'coming-soon',
    genre: 'Khoa học viễn tưởng / Sinh tồn',
    genreKey: 'Sci-Fi',
    duration: 139,
    ageRating: 'T13',
    rating: null,
    releaseDate: '2026-12-18',
    releaseLabel: '18/12/2026',
    director: 'Devon Brooks',
    cast: ['Tariq Al-Mansoor', 'Hannah Reid', 'Kenji Sato'],
    language: 'Tiếng Anh · Phụ đề tiếng Việt',
    formats: ['IMAX Laser', 'Dolby Atmos', '2D Sub'],
    isFeaturedHero: false,
    heroTagline: 'Ra mắt trên IMAX ngày 18/12',
    heroDescription:
      'Mất liên lạc sau một đợt bùng phát năng lượng gần sao khổng lồ đỏ, giám đốc bay của Trạm Số Chín phải tự đưa tàu con thoi hư hỏng trở về.',
    synopsis:
      'Khi một cơn bão Mặt Trời bất ngờ làm tê liệt hệ thống dẫn đường quanh Trạm Số Chín, kỹ sư Tariq Al-Mansoor chỉ còn lượng oxy đủ dùng trong sáu giờ. Anh phải ghép hai mô-đun đang quay bằng quan sát trực tiếp để cứu phi hành đoàn.',
    heroImage: '/src/assets/images/poster_orbital_nine_1794993132939.jpg',
    posterImage: '/src/assets/images/poster_orbital_nine_1794993132939.jpg',
    trailerLength: '2:30',
  },
];

export const CINEMAS = [
  {
    id: 'marumo-saigon-centre',
    name: 'MARUMO Saigon Centre',
    city: 'Ho Chi Minh City',
    cityLabel: 'TP. Hồ Chí Minh',
    district: 'Quận 1',
    address: 'Tầng 5, đường Lê Lợi, phường Bến Nghé, Quận 1',
    phone: '(028) 3829 8800',
    screens: 9,
    formats: ['IMAX Laser', 'Dolby Atmos', 'VIP Lounge', '2D Sub'],
    hours: '08:30 – 24:00',
    parking: 'Hầm B2–B4, có thang máy lên rạp',
    image: '/src/assets/images/cinema-auditorium-720.webp',
    description:
      'Cụm rạp flagship ngay trung tâm Quận 1 với phòng IMAX Laser, Dolby Atmos và khu lounge riêng dành cho thành viên MARUMO Club.',
  },
  {
    id: 'marumo-crescent-plaza',
    name: 'MARUMO Crescent Plaza',
    city: 'Ho Chi Minh City',
    cityLabel: 'TP. Hồ Chí Minh',
    district: 'Quận 7',
    address: 'Đường Tôn Dật Tiên, phường Tân Phú, Quận 7',
    phone: '(028) 5413 7720',
    screens: 8,
    formats: ['4DX', 'Dolby Atmos', '2D Sub', '2D Dub'],
    hours: '09:00 – 23:45',
    parking: 'Bãi xe trung tâm thương mại ven hồ',
    image: '/src/assets/images/cinema-auditorium-720.webp',
    description:
      'Không gian rộng rãi bên hồ Bán Nguyệt, nổi bật với phòng 4DX và các suất chiếu dành cho gia đình vào cuối tuần.',
  },
  {
    id: 'marumo-thuduc-hub',
    name: 'MARUMO Thủ Đức',
    city: 'Ho Chi Minh City',
    cityLabel: 'TP. Hồ Chí Minh',
    district: 'TP. Thủ Đức',
    address: 'Đại lộ Phạm Văn Đồng, Hiệp Bình Chánh, Thủ Đức',
    phone: '(028) 3726 9100',
    screens: 7,
    formats: ['2D Sub', '2D Dub', 'Couple Suites'],
    hours: '09:00 – 23:30',
    parking: 'Miễn phí gửi xe tại sân và tầng hầm',
    image: '/src/assets/images/cinema-auditorium-720.webp',
    description:
      'Rạp khu Đông với 7 phòng chiếu hiện đại, bãi xe miễn phí và nhiều suất lồng tiếng Việt phù hợp cho cả gia đình.',
  },
  {
    id: 'marumo-trang-tien',
    name: 'MARUMO Tràng Tiền',
    city: 'Hanoi',
    cityLabel: 'Hà Nội',
    district: 'Hoàn Kiếm',
    address: 'Đường Hai Bà Trưng, phường Tràng Tiền, Hoàn Kiếm',
    phone: '(024) 3938 6655',
    screens: 10,
    formats: ['IMAX Laser', 'Dolby Atmos', 'Gold Class', '2D Sub'],
    hours: '08:30 – 24:00',
    parking: 'Dịch vụ đỗ xe và bãi xe ngầm',
    image: '/src/assets/images/cinema-auditorium-720.webp',
    description:
      'Rạp lâu năm giữa trung tâm Hà Nội, mang đến IMAX Laser, Dolby Atmos và phòng Gold Class cho trải nghiệm xem phim riêng tư.',
  },
  {
    id: 'marumo-west-lake',
    name: 'MARUMO Hồ Tây',
    city: 'Hanoi',
    cityLabel: 'Hà Nội',
    district: 'Tây Hồ',
    address: 'Đường Lạc Long Quân, Phú Thượng, Tây Hồ',
    phone: '(024) 3758 4410',
    screens: 6,
    formats: ['2D Sub', '2D Dub', 'Family Hall'],
    hours: '09:00 – 23:30',
    parking: 'Tầng hầm B1 của trung tâm thương mại',
    image: '/src/assets/images/cinema-auditorium-720.webp',
    description:
      'Không gian ấm cúng bên Hồ Tây với phòng Family Hall, vị trí gửi xe thuận tiện cho những buổi xem phim sum họp.',
  },
  {
    id: 'marumo-han-river',
    name: 'MARUMO Sông Hàn IMAX',
    city: 'Da Nang',
    cityLabel: 'Đà Nẵng',
    district: 'Hải Châu',
    address: '910 Ngô Quyền và đường dạo ven sông, quận Hải Châu',
    phone: '(0236) 388 9944',
    screens: 8,
    formats: ['IMAX Laser', '4DX', '2D Sub', '2D Dub'],
    hours: '08:45 – 23:45',
    parking: 'Bãi xe quảng trường ven sông',
    image: '/src/assets/images/cinema-auditorium-720.webp',
    description:
      'Rạp ven sông Hàn với IMAX Laser, 4DX và quảng trường thoáng đãng, lý tưởng cho các suất chiếu tối cuối tuần.',
  },
];

export const CINEMA_GALLERIES = {
  'marumo-saigon-centre': [
    {
      src: '/src/assets/images/cinemas/saigon-centre-imax.webp',
      label: 'Khán phòng IMAX',
      alt: 'Khán phòng IMAX với màn hình lớn, ghế đỏ và các dải đèn đồng',
    },
    {
      src: '/src/assets/images/cinemas/saigon-centre-vip.webp',
      label: 'Phòng chờ VIP',
      alt: 'Phòng chờ VIP với ghế da đỏ, bàn đồng và cửa kính nhìn thành phố',
    },
    {
      src: '/src/assets/images/cinemas/saigon-centre-lobby.webp',
      label: 'Sảnh & bắp nước',
      alt: 'Sảnh rạp sang trọng với quầy bắp nước và sàn đá tối màu',
    },
  ],
  'marumo-crescent-plaza': [
    {
      src: '/src/assets/images/cinemas/crescent-plaza-4dx.webp',
      label: 'Phòng 4DX',
      alt: 'Phòng chiếu 4DX với ghế chuyển động đỏ và màn hình cong',
    },
    {
      src: '/src/assets/images/cinemas/crescent-plaza-lakeside.webp',
      label: 'Mặt tiền ven hồ',
      alt: 'Mặt tiền rạp kính phát sáng bên hồ lúc hoàng hôn',
    },
    {
      src: '/src/assets/images/cinemas/crescent-plaza-lobby.webp',
      label: 'Sảnh gia đình',
      alt: 'Sảnh rạp sáng thoáng với quầy bắp nước và khu ghế gia đình',
    },
  ],
  'marumo-thuduc-hub': [
    {
      src: '/src/assets/images/cinemas/thuduc-auditorium.webp',
      label: 'Khán phòng',
      alt: 'Khán phòng với hàng ghế đỏ, lối đi rộng và màn hình lớn',
    },
    {
      src: '/src/assets/images/cinemas/thuduc-family-lobby.webp',
      label: 'Sảnh gia đình',
      alt: 'Sảnh rạp sáng với quầy bắp nước, ghế đỏ và góc vui chơi',
    },
    {
      src: '/src/assets/images/cinemas/thuduc-exterior.webp',
      label: 'Mặt tiền rạp',
      alt: 'Mặt tiền rạp hiện đại với dải lam đỏ và bãi xe phía trước',
    },
  ],
  'marumo-trang-tien': [
    {
      src: '/src/assets/images/cinemas/trang-tien-imax.webp',
      label: 'Khán phòng IMAX',
      alt: 'Khán phòng IMAX ốp gỗ tối với ghế nhung đỏ và đèn đồng',
    },
    {
      src: '/src/assets/images/cinemas/trang-tien-gold-class.webp',
      label: 'Phòng Gold Class',
      alt: 'Phòng chiếu Gold Class riêng tư với ghế da đỏ và đèn bàn đồng',
    },
    {
      src: '/src/assets/images/cinemas/trang-tien-lobby.webp',
      label: 'Sảnh chờ',
      alt: 'Sảnh chờ cổ điển với cột gỗ, thảm đỏ và quầy bắp nước viền đồng',
    },
  ],
  'marumo-west-lake': [
    {
      src: '/src/assets/images/cinemas/west-lake-family-hall.webp',
      label: 'Family Hall',
      alt: 'Phòng Family Hall với ghế sofa đỏ, bàn nhỏ và đèn ấm',
    },
    {
      src: '/src/assets/images/cinemas/west-lake-cafe.webp',
      label: 'Café nhìn hồ',
      alt: 'Khu café trong rạp với cửa kính nhìn ra hồ lúc hoàng hôn',
    },
    {
      src: '/src/assets/images/cinemas/west-lake-concession.webp',
      label: 'Quầy bắp nước',
      alt: 'Quầy bắp nước ấm cúng với máy bắp và các hộp bắp đỏ',
    },
  ],
  'marumo-han-river': [
    {
      src: '/src/assets/images/cinemas/han-river-imax.webp',
      label: 'Khán phòng IMAX',
      alt: 'Khán phòng IMAX với màn hình lớn và ánh sáng xanh ấm',
    },
    {
      src: '/src/assets/images/cinemas/han-river-exterior.webp',
      label: 'Mặt tiền ven sông',
      alt: 'Mặt tiền rạp kính đỏ rực bên đường dạo ven sông Hàn về đêm',
    },
    {
      src: '/src/assets/images/cinemas/han-river-4dx.webp',
      label: 'Phòng 4DX',
      alt: 'Ghế 4DX chuyển động màu đỏ và màn hình thành phố ven sông',
    },
  ],
};

export const DATES = [
  { id: '2026-11-19', dayName: 'Hôm nay', dateLabel: '19/11', fullLabel: 'Thứ Năm, 19/11' },
  { id: '2026-11-20', dayName: 'Ngày mai', dateLabel: '20/11', fullLabel: 'Thứ Sáu, 20/11' },
  { id: '2026-11-21', dayName: 'Thứ Bảy', dateLabel: '21/11', fullLabel: 'Thứ Bảy, 21/11' },
  { id: '2026-11-22', dayName: 'Chủ Nhật', dateLabel: '22/11', fullLabel: 'Chủ Nhật, 22/11' },
  { id: '2026-11-23', dayName: 'Thứ Hai', dateLabel: '23/11', fullLabel: 'Thứ Hai, 23/11' },
  { id: '2026-11-24', dayName: 'Thứ Ba', dateLabel: '24/11', fullLabel: 'Thứ Ba, 24/11' },
  { id: '2026-11-25', dayName: 'Thứ Tư', dateLabel: '25/11', fullLabel: 'Thứ Tư, 25/11' },
  { id: '2026-11-26', dayName: 'Thứ Năm', dateLabel: '26/11', fullLabel: 'Thứ Năm, 26/11' },
  { id: '2026-11-27', dayName: 'Thứ Sáu', dateLabel: '27/11', fullLabel: 'Thứ Sáu, 27/11' },
  { id: '2026-11-28', dayName: 'Thứ Bảy', dateLabel: '28/11', fullLabel: 'Thứ Bảy, 28/11' },
  { id: '2026-11-29', dayName: 'Chủ Nhật', dateLabel: '29/11', fullLabel: 'Chủ Nhật, 29/11' },
  { id: '2026-11-30', dayName: 'Thứ Hai', dateLabel: '30/11', fullLabel: 'Thứ Hai, 30/11' },
];

export const ADVANCE_BOOKING_DAYS = 5;
export const BOOKABLE_DATES = DATES.slice(0, ADVANCE_BOOKING_DAYS);

export const CONCESSIONS = [
  {
    id: 'combo-marumo-duo',
    name: 'Combo đôi MARUMO caramel',
    description: '1 bắp caramel lớn + 2 nước lạnh (650 ml)',
    price: 115000,
    image: '/src/assets/images/promo_popcorn_combo_1794993134803.jpg',
  },
  {
    id: 'combo-solo-classic',
    name: 'Combo bắp nước một người',
    description: '1 bắp bơ mặn vừa + 1 nước ngọt (650 ml)',
    price: 75000,
    image: '/src/assets/images/promo_popcorn_combo_1794993134803.jpg',
  },
  {
    id: 'combo-imax-family',
    name: 'Combo gia đình IMAX',
    description: '2 bắp lớn (vị ngọt và phô mai) + 4 nước ngọt',
    price: 180000,
    image: '/src/assets/images/promo_popcorn_combo_1794993134803.jpg',
  },
  {
    id: 'combo-nachos-cola',
    name: 'Nachos giòn và cola',
    description: 'Nachos phô mai cheddar nóng + sốt ớt jalapeño + 1 cola lạnh',
    price: 85000,
    image: '/src/assets/images/promo_popcorn_combo_1794993134803.jpg',
  },
];

export const PROMOTIONS = [
  {
    id: 'promo-marumo20',
    code: 'MARUMO20',
    title: 'Giảm 20% khi đặt vé trực tuyến',
    subtitle: 'Áp dụng cho vé 2D, Dolby Atmos và IMAX',
    validUntil: 'Đến hết ngày 31/12/2026',
    discountText: 'GIẢM 20%',
    details:
      'Nhập mã MARUMO20 khi thanh toán để giảm 20% tổng tiền vé tại cả 6 cụm rạp MARUMO.',
    image: '/src/assets/images/cinema-auditorium-720.webp',
  },
  {
    id: 'promo-happy-wed',
    code: 'WED50',
    title: 'Thứ Tư vui vẻ dành cho hội viên',
    subtitle: 'Hội viên MARUMO Club được giảm 40.000 ₫ mỗi vé vào Thứ Tư',
    validUntil: 'Mỗi Thứ Tư · Tất cả cụm rạp',
    discountText: 'GIẢM 40.000 ₫ / VÉ',
    details:
      'Mỗi Thứ Tư, nhập WED50 khi thanh toán để giảm 40.000 ₫ cho mỗi ghế đã chọn. Mức giảm tối đa bằng tổng tiền vé.',
    image: '/src/assets/images/promo_popcorn_combo_1794993134803.jpg',
  },
  {
    id: 'promo-student15',
    code: 'STUDENT15',
    title: 'Ưu đãi U22 và học sinh, sinh viên',
    subtitle: 'Giảm 15% cho các suất sáng và chiều trước 17:00',
    validUntil: 'Thứ Hai – Thứ Sáu · Trước 17:00',
    discountText: 'GIẢM 15%',
    details:
      'Học sinh, sinh viên và khách từ 22 tuổi trở xuống được giảm 15% cho suất chiếu ban ngày, cùng điểm thưởng khi mua combo đôi.',
    image: '/src/assets/images/hero_starlight_symphony_1794993128411.jpg',
  },
];

export const MEMBERSHIP_TIERS = [
  {
    id: 'club',
    name: 'MARUMO Club',
    requirement: 'Đăng ký miễn phí',
    earnRate: 'Tích 5% điểm từ vé và bắp nước',
    perks: [
      'Vé điện tử có mã QR để vào rạp',
      'Giá ưu đãi hội viên vào Thứ Tư',
      'Tặng bắp nhỏ trong tháng sinh nhật',
    ],
  },
  {
    id: 'silver',
    name: 'Ngôi sao Bạc',
    requirement: '12 lượt xem hoặc chi tiêu 1.500.000 ₫ mỗi năm',
    earnRate: 'Tích 8% điểm từ mọi giao dịch',
    perks: [
      'Tặng 2 phiếu đổi vé 2D mỗi năm',
      'Giảm 10% tất cả combo bắp nước mỗi ngày',
      'Được đặt sớm vé IMAX cho các phim mới',
    ],
  },
  {
    id: 'red-premiere',
    name: 'Hạng Kim Cương',
    requirement: '30 lượt xem hoặc chi tiêu 3.800.000 ₫ mỗi năm',
    earnRate: 'Tích 12% điểm và ưu tiên phòng chờ',
    perks: [
      'Tặng 4 phiếu đổi vé IMAX Laser hoặc Dolby Atmos mỗi năm',
      'Nâng hạng ghế miễn phí khi còn chỗ',
      'Nhận lời mời dự suất chiếu ra mắt',
    ],
  },
];

// Generate deterministic showtimes across all now-showing movies, cinemas, and dates
const FORMAT_SCHEDULES = {
  'solar-odyssey': [
    { format: 'IMAX Laser', times: ['10:15', '13:30', '16:45', '20:00'], hall: 'Phòng 1 · IMAX', basePrice: 135000 },
    { format: 'Dolby Atmos', times: ['11:45', '15:00', '18:15', '21:30'], hall: 'Phòng 2 · Atmos', basePrice: 115000 },
    { format: '2D Sub', times: ['09:40', '12:50', '17:10', '22:10'], hall: 'Phòng 4', basePrice: 95000 },
  ],
  'velvet-syndicate': [
    { format: 'Dolby Atmos', times: ['11:00', '14:20', '17:50', '21:15'], hall: 'Phòng 2 · Atmos', basePrice: 110000 },
    { format: '2D Sub', times: ['10:05', '13:15', '16:30', '19:45', '22:30'], hall: 'Phòng 5', basePrice: 95000 },
  ],
  'starlight-symphony': [
    { format: '2D Dub', times: ['09:30', '12:00', '14:40', '17:20'], hall: 'Phòng 3 · Gia đình', basePrice: 90000 },
    { format: '2D Sub', times: ['11:15', '15:50', '19:00'], hall: 'Phòng 6', basePrice: 95000 },
    { format: 'IMAX Laser', times: ['10:40', '16:10'], hall: 'Phòng 1 · IMAX', basePrice: 130000 },
  ],
  'apex-protocol': [
    { format: '4DX', times: ['12:15', '15:30', '18:45', '21:50'], hall: 'Phòng 7 · 4DX', basePrice: 140000 },
    { format: '2D Sub', times: ['10:30', '13:50', '17:00', '20:20'], hall: 'Phòng 4', basePrice: 95000 },
  ],
};

export function buildAllShowtimes() {
  const results = [];
  for (const cinema of CINEMAS) {
    for (const date of DATES) {
      for (const movie of MOVIES.filter((m) => m.status === 'now-showing')) {
        const templates = FORMAT_SCHEDULES[movie.id] || [];
        for (const tpl of templates) {
          // Only include IMAX / 4DX if the branch supports it (or fallback 2D Sub always exists)
          if (tpl.format === 'IMAX Laser' && !cinema.formats.includes('IMAX Laser')) continue;
          if (tpl.format === '4DX' && !cinema.formats.includes('4DX')) continue;
          if (tpl.format === 'Dolby Atmos' && !cinema.formats.includes('Dolby Atmos')) continue;

          for (const time of tpl.times) {
            const id = `${movie.id}__${cinema.id}__${date.id}__${tpl.format.replace(/\s+/g, '')}__${time.replace(':', '')}`;
            results.push({
              id,
              movieId: movie.id,
              cinemaId: cinema.id,
              dateId: date.id,
              format: tpl.format,
              time,
              hall: tpl.hall,
              basePrice: tpl.basePrice,
            });
          }
        }
      }
    }
  }
  return results;
}

export const SHOWTIMES = buildAllShowtimes();
