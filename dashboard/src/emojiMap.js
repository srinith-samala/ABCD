// Smart relevant emoji resolver for grocery, restaurant, kitchen & inventory items
export const EMOJI_PALETTE = [
  {
    category: 'Vegetables & Produce',
    emojis: ['🍅', '🧅', '🥔', '🧄', '🫚', '🌶️', '🍋', '🥕', '🥦', '🥬', '🥒', '🍄', '🌽', '🫛', '🍆', '🥑', '🌿'],
  },
  {
    category: 'Fruits',
    emojis: ['🍎', '🍌', '🥭', '🍊', '🍇', '🍉', '🍍', '🍓', '🍈', '🥥'],
  },
  {
    category: 'Dairy & Eggs',
    emojis: ['🥛', '🧀', '🧈', '🥣', '🥚', '🥫'],
  },
  {
    category: 'Meat & Seafood',
    emojis: ['🍗', '🥩', '🍖', '🥓', '🐟', '🦐', '🦀'],
  },
  {
    category: 'Staples, Grains & Bakery',
    emojis: ['🍚', '🌾', '🍞', '🫘', '🍝', '🍜', '🧂', '🍬', '🛢️', '🥫'],
  },
  {
    category: 'Drinks & Bar',
    emojis: ['☕', '🫖', '🥤', '🧃', '🍺', '🍷', '🥃', '🍸', '🍹', '💧'],
  },
  {
    category: 'Supplies & Packaging',
    emojis: ['📦', '🛍️', '🍽️', '🍴', '🧻', '🧼', '🧹', '🧾', '⛽'],
  },
];

const KEYWORD_MAP = [
  // Vegetables
  { keys: ['tomato'], emoji: '🍅' },
  { keys: ['potato', 'potatoes', 'aloo'], emoji: '🥔' },
  { keys: ['onion', 'onions', 'pyaz', 'pyaaz'], emoji: '🧅' },
  { keys: ['garlic', 'lahsun'], emoji: '🧄' },
  { keys: ['ginger', 'adrak'], emoji: '🫚' },
  { keys: ['chilli', 'chili', 'mirch', 'mirchi', 'jalapeno', 'capsicum', 'pepper'], emoji: '🌶️' },
  { keys: ['lemon', 'lime', 'nimbu'], emoji: '🍋' },
  { keys: ['carrot', 'carrots', 'gajar'], emoji: '🥕' },
  { keys: ['cucumber', 'kheera', 'kakdi'], emoji: '🥒' },
  { keys: ['cabbage', 'patta gobhi'], emoji: '🥬' },
  { keys: ['cauliflower', 'phool gobhi', 'gobhi', 'broccoli'], emoji: '🥦' },
  { keys: ['spinach', 'palak', 'methi', 'coriander', 'dhaniya', 'mint', 'pudina', 'curry leaves', 'kadi patta', 'greens', 'lettuce', 'herb', 'herbs'], emoji: '🌿' },
  { keys: ['mushroom', 'mushrooms', 'khumb'], emoji: '🍄' },
  { keys: ['corn', 'makka', 'sweet corn'], emoji: '🌽' },
  { keys: ['peas', 'matar', 'green peas'], emoji: '🫛' },
  { keys: ['beetroot', 'chukandar'], emoji: '🍠' },
  { keys: ['brinjal', 'eggplant', 'baingan'], emoji: '🍆' },
  { keys: ['avocado'], emoji: '🥑' },

  // Fruits
  { keys: ['apple', 'seb'], emoji: '🍎' },
  { keys: ['banana', 'kela'], emoji: '🍌' },
  { keys: ['orange', 'santra', 'citrus'], emoji: '🍊' },
  { keys: ['mango', 'aam'], emoji: '🥭' },
  { keys: ['grape', 'grapes', 'angoor'], emoji: '🍇' },
  { keys: ['watermelon', 'tarbooz'], emoji: '🍉' },
  { keys: ['pineapple', 'ananas'], emoji: '🍍' },
  { keys: ['strawberry', 'strawberries', 'berry', 'berries'], emoji: '🍓' },
  { keys: ['papaya', 'papita'], emoji: '🍈' },
  { keys: ['coconut', 'nariyal'], emoji: '🥥' },

  // Dairy & Eggs
  { keys: ['milk', 'doodh', 'toned milk', 'cow milk'], emoji: '🥛' },
  { keys: ['paneer', 'cottage cheese'], emoji: '🧈' },
  { keys: ['butter', 'makkhan', 'amul butter'], emoji: '🧈' },
  { keys: ['ghee', 'desi ghee'], emoji: '🧈' },
  { keys: ['cheese', 'cheddar', 'mozzarella', 'parmesan'], emoji: '🧀' },
  { keys: ['curd', 'dahi', 'yogurt', 'raita'], emoji: '🥣' },
  { keys: ['cream', 'fresh cream', 'malai'], emoji: '🥛' },
  { keys: ['egg', 'eggs', 'anda'], emoji: '🥚' },
  { keys: ['mayo', 'mayonnaise'], emoji: '🥫' },

  // Meat, Poultry & Seafood
  { keys: ['chicken', 'murgh', 'tikka', 'tandoori'], emoji: '🍗' },
  { keys: ['mutton', 'lamb', 'goat', 'gosht', 'meat', 'beef', 'steak'], emoji: '🥩' },
  { keys: ['pork', 'bacon', 'ham', 'sausage'], emoji: '🥓' },
  { keys: ['fish', 'salmon', 'tuna', 'machli', 'surmai', 'pomfret', 'rohu', 'katla', 'basa'], emoji: '🐟' },
  { keys: ['prawn', 'prawns', 'shrimp', 'jhinga'], emoji: '🦐' },
  { keys: ['crab', 'kekda', 'lobster'], emoji: '🦀' },

  // Grains, Staples, Flours, Rice, Noodles
  { keys: ['rice', 'basmati', 'chawal', 'biryani rice', 'kolam'], emoji: '🍚' },
  { keys: ['flour', 'atta', 'maida', 'wheat', 'sooji', 'suji', 'rava', 'besan', 'grain', 'multigrain'], emoji: '🌾' },
  { keys: ['dal', 'daal', 'lentil', 'lentils', 'chana', 'rajma', 'moong', 'urad', 'toor', 'pulses', 'arhar'], emoji: '🫘' },
  { keys: ['bread', 'pav', 'bun', 'buns', 'roti', 'naan', 'paratha', 'bakery', 'toast'], emoji: '🍞' },
  { keys: ['pasta', 'macaroni', 'spaghetti', 'penne'], emoji: '🍝' },
  { keys: ['noodle', 'noodles', 'maggi', 'chowmein', 'hakka'], emoji: '🍜' },

  // Oils, Sauces, Spices & Seasoning
  { keys: ['oil', 'tel', 'sunflower oil', 'mustard oil', 'olive oil', 'refined oil', 'soya oil'], emoji: '🛢️' },
  { keys: ['sauce', 'ketchup', 'vinegar', 'soya sauce', 'schezwan', 'paste', 'mayo'], emoji: '🥫' },
  { keys: ['salt', 'namak', 'rock salt'], emoji: '🧂' },
  { keys: ['sugar', 'cheeni', 'shakar', 'jaggery', 'gud', 'honey'], emoji: '🍬' },
  { keys: ['masala', 'spice', 'spices', 'turmeric', 'haldi', 'jeera', 'cumin', 'elaichi', 'cardamom', 'clove', 'laung', 'cinnamon', 'dalchini', 'garam masala', 'chaat masala', 'kasuri methi'], emoji: '🌶️' },

  // Drinks & Beverages
  { keys: ['coffee', 'espresso', 'cappuccino', 'nescafe', 'bru'], emoji: '☕' },
  { keys: ['tea', 'chai', 'green tea', 'tea bags'], emoji: '🫖' },
  { keys: ['beer', 'kingfisher', 'budweiser', 'bira', 'tuborg', 'heineken', 'carlsberg', 'lager'], emoji: '🍺' },
  { keys: ['whiskey', 'whisky', 'scotch', 'bourbon', 'rum', 'vodka', 'gin', 'liquor', 'alcohol'], emoji: '🥃' },
  { keys: ['wine', 'red wine', 'white wine'], emoji: '🍷' },
  { keys: ['cocktail', 'mocktail'], emoji: '🍹' },
  { keys: ['coke', 'pepsi', 'sprite', 'thums up', 'soda', 'cold drink', 'soft drink', 'fanta', 'beverage', 'mirinda', 'limca'], emoji: '🥤' },
  { keys: ['water', 'bisleri', 'aquafina', 'kinley', 'mineral water'], emoji: '💧' },
  { keys: ['juice', 'real juice', 'tropicana'], emoji: '🧃' },

  // Sweets & Snacks
  { keys: ['ice cream', 'icecream', 'kulfi'], emoji: '🍨' },
  { keys: ['chocolate', 'choco', 'cocoa'], emoji: '🍫' },
  { keys: ['cake', 'pastry', 'muffin'], emoji: '🍰' },
  { keys: ['mithai', 'gulab jamun', 'rasgulla', 'sweet', 'halwa'], emoji: '🍮' },
  { keys: ['snack', 'chips', 'wafer', 'namkeen', 'biscuit', 'biscuits', 'cookie', 'cookies'], emoji: '🍪' },

  // Supplies & Cleaning
  { keys: ['box', 'boxes', 'carton', 'corrugated box', 'packaging box'], emoji: '📦' },
  { keys: ['bag', 'bags', 'pouch', 'carry bag', 'polythene'], emoji: '🛍️' },
  { keys: ['foil', 'aluminum', 'silver foil', 'cling wrap', 'butter paper'], emoji: '🥈' },
  { keys: ['tissue', 'napkin', 'paper roll', 'tissue paper', 'wet wipes'], emoji: '🧻' },
  { keys: ['soap', 'detergent', 'vim', 'surf', 'cleaner', 'wash', 'sanitizer', 'handwash', 'floor cleaner', 'dishwash'], emoji: '🧼' },
  { keys: ['sponge', 'scrub', 'broom', 'wiper', 'mop', 'duster'], emoji: '🧹' },
  { keys: ['container', 'disposable', 'glass', 'glasses', 'cup', 'cups', 'plate', 'plates', 'spoon', 'fork', 'straw'], emoji: '🍽️' },
  { keys: ['gas', 'cylinder', 'lpg', 'fuel'], emoji: '⛽' },
];

const CATEGORY_MAP = [
  { keys: ['dairy', 'milk'], emoji: '🥛' },
  { keys: ['veg', 'vegetable', 'vegetables', 'produce'], emoji: '🥦' },
  { keys: ['fruit', 'fruits'], emoji: '🍎' },
  { keys: ['meat', 'non veg', 'non-veg', 'poultry', 'chicken', 'mutton'], emoji: '🍗' },
  { keys: ['seafood', 'fish'], emoji: '🐟' },
  { keys: ['grocery', 'staple', 'staples', 'provision', 'provisions', 'grain', 'grains'], emoji: '🌾' },
  { keys: ['spice', 'spices', 'masala', 'seasoning'], emoji: '🌶️' },
  { keys: ['bakery', 'bread'], emoji: '🍞' },
  { keys: ['drink', 'drinks', 'beverage', 'beverages', 'bar'], emoji: '🍹' },
  { keys: ['liquor', 'alcohol', 'beer', 'spirits'], emoji: '🍺' },
  { keys: ['packaging', 'disposable', 'disposables'], emoji: '📦' },
  { keys: ['clean', 'cleaning', 'hygiene', 'housekeeping'], emoji: '🧼' },
  { keys: ['sweet', 'sweets', 'dessert', 'desserts'], emoji: '🍨' },
];

/**
 * Returns a smart, relevant emoji for a product.
 * If the current emoji is already customized (and not generic '📦'), it is preserved.
 * Otherwise, deduces the most relevant emoji based on product name and/or category.
 */
export function getRelevantEmoji(name, category, currentEmoji) {
  // If an intentional custom emoji other than 📦 is already assigned, keep it
  if (currentEmoji && currentEmoji !== '📦' && currentEmoji.trim() !== '') {
    return currentEmoji.trim();
  }

  const n = String(name || '').toLowerCase().trim();
  const c = String(category?.name || category || '').toLowerCase().trim();

  // 1. Try matching keywords in product name
  if (n) {
    for (const item of KEYWORD_MAP) {
      for (const k of item.keys) {
        // match whole word or strong substring
        const reg = new RegExp(`\\b${k}\\b`, 'i');
        if (reg.test(n) || n.includes(k)) {
          return item.emoji;
        }
      }
    }
  }

  // 2. Try matching category keywords
  if (c) {
    for (const item of CATEGORY_MAP) {
      for (const k of item.keys) {
        if (c.includes(k)) {
          return item.emoji;
        }
      }
    }
  }

  // 3. Fallback: if category is 'Packaging' or 'Supplies', keep 📦; otherwise a warm restaurant/grocery 🍽️
  if (c.includes('pack') || c.includes('suppl') || n.includes('box')) return '📦';
  return '🍽️';
}
