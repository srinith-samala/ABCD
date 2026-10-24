// Smart relevant emoji resolver for backend product creation and imports
const KEYWORD_MAP = [
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
  { keys: ['milk', 'doodh', 'toned milk', 'cow milk'], emoji: '🥛' },
  { keys: ['paneer', 'cottage cheese'], emoji: '🧈' },
  { keys: ['butter', 'makkhan', 'amul butter'], emoji: '🧈' },
  { keys: ['ghee', 'desi ghee'], emoji: '🧈' },
  { keys: ['cheese', 'cheddar', 'mozzarella', 'parmesan'], emoji: '🧀' },
  { keys: ['curd', 'dahi', 'yogurt', 'raita'], emoji: '🥣' },
  { keys: ['cream', 'fresh cream', 'malai'], emoji: '🥛' },
  { keys: ['egg', 'eggs', 'anda'], emoji: '🥚' },
  { keys: ['mayo', 'mayonnaise'], emoji: '🥫' },
  { keys: ['chicken', 'murgh', 'tikka', 'tandoori'], emoji: '🍗' },
  { keys: ['mutton', 'lamb', 'goat', 'gosht', 'meat', 'beef', 'steak'], emoji: '🥩' },
  { keys: ['pork', 'bacon', 'ham', 'sausage'], emoji: '🥓' },
  { keys: ['fish', 'salmon', 'tuna', 'machli', 'surmai', 'pomfret', 'rohu', 'katla', 'basa'], emoji: '🐟' },
  { keys: ['prawn', 'prawns', 'shrimp', 'jhinga'], emoji: '🦐' },
  { keys: ['crab', 'kekda', 'lobster'], emoji: '🦀' },
  { keys: ['rice', 'basmati', 'chawal', 'biryani rice', 'kolam'], emoji: '🍚' },
  { keys: ['flour', 'atta', 'maida', 'wheat', 'sooji', 'suji', 'rava', 'besan', 'grain', 'multigrain'], emoji: '🌾' },
  { keys: ['dal', 'daal', 'lentil', 'lentils', 'chana', 'rajma', 'moong', 'urad', 'toor', 'pulses', 'arhar'], emoji: '🫘' },
  { keys: ['bread', 'pav', 'bun', 'buns', 'roti', 'naan', 'paratha', 'bakery', 'toast'], emoji: '🍞' },
  { keys: ['pasta', 'macaroni', 'spaghetti', 'penne'], emoji: '🍝' },
  { keys: ['noodle', 'noodles', 'maggi', 'chowmein', 'hakka'], emoji: '🍜' },
  { keys: ['oil', 'tel', 'sunflower oil', 'mustard oil', 'olive oil', 'refined oil', 'soya oil'], emoji: '🛢️' },
  { keys: ['sauce', 'ketchup', 'vinegar', 'soya sauce', 'schezwan', 'paste'], emoji: '🥫' },
  { keys: ['salt', 'namak', 'rock salt'], emoji: '🧂' },
  { keys: ['sugar', 'cheeni', 'shakar', 'jaggery', 'gud', 'honey'], emoji: '🍬' },
  { keys: ['masala', 'spice', 'spices', 'turmeric', 'haldi', 'jeera', 'cumin', 'elaichi', 'cardamom', 'clove', 'laung', 'cinnamon', 'dalchini'], emoji: '🌶️' },
  { keys: ['coffee', 'espresso', 'cappuccino', 'nescafe'], emoji: '☕' },
  { keys: ['tea', 'chai', 'green tea'], emoji: '🫖' },
  { keys: ['beer', 'kingfisher', 'budweiser', 'bira', 'tuborg'], emoji: '🍺' },
  { keys: ['whiskey', 'whisky', 'scotch', 'bourbon', 'rum', 'vodka', 'gin', 'liquor', 'alcohol'], emoji: '🥃' },
  { keys: ['wine', 'red wine', 'white wine'], emoji: '🍷' },
  { keys: ['cocktail', 'mocktail'], emoji: '🍹' },
  { keys: ['coke', 'pepsi', 'sprite', 'thums up', 'soda', 'cold drink', 'soft drink', 'fanta', 'beverage'], emoji: '🥤' },
  { keys: ['water', 'bisleri', 'aquafina', 'mineral water'], emoji: '💧' },
  { keys: ['juice', 'real juice'], emoji: '🧃' },
  { keys: ['ice cream', 'icecream', 'kulfi'], emoji: '🍨' },
  { keys: ['chocolate', 'choco'], emoji: '🍫' },
  { keys: ['cake', 'pastry'], emoji: '🍰' },
  { keys: ['mithai', 'gulab jamun', 'sweet'], emoji: '🍮' },
  { keys: ['snack', 'chips', 'wafer', 'namkeen', 'biscuit', 'cookie'], emoji: '🍪' },
  { keys: ['box', 'boxes', 'carton', 'corrugated box'], emoji: '📦' },
  { keys: ['bag', 'bags', 'pouch'], emoji: '🛍️' },
  { keys: ['foil', 'aluminum', 'silver foil', 'cling wrap'], emoji: '🥈' },
  { keys: ['tissue', 'napkin', 'paper roll'], emoji: '🧻' },
  { keys: ['soap', 'detergent', 'vim', 'surf', 'cleaner', 'wash', 'sanitizer'], emoji: '🧼' },
  { keys: ['sponge', 'scrub', 'broom', 'wiper', 'mop'], emoji: '🧹' },
  { keys: ['container', 'disposable', 'glass', 'cup', 'plate', 'spoon'], emoji: '🍽️' },
  { keys: ['gas', 'cylinder', 'lpg'], emoji: '⛽' },
];

const CATEGORY_MAP = [
  { keys: ['dairy', 'milk'], emoji: '🥛' },
  { keys: ['veg', 'vegetable', 'vegetables', 'produce'], emoji: '🥦' },
  { keys: ['fruit', 'fruits'], emoji: '🍎' },
  { keys: ['meat', 'non veg', 'non-veg', 'poultry'], emoji: '🍗' },
  { keys: ['seafood', 'fish'], emoji: '🐟' },
  { keys: ['grocery', 'staple', 'staples', 'provision', 'grain'], emoji: '🌾' },
  { keys: ['spice', 'spices', 'masala'], emoji: '🌶️' },
  { keys: ['bakery', 'bread'], emoji: '🍞' },
  { keys: ['drink', 'drinks', 'beverage', 'bar'], emoji: '🍹' },
  { keys: ['liquor', 'alcohol', 'beer'], emoji: '🍺' },
  { keys: ['packaging', 'disposable'], emoji: '📦' },
  { keys: ['clean', 'cleaning', 'hygiene'], emoji: '🧼' },
  { keys: ['sweet', 'sweets', 'dessert'], emoji: '🍨' },
];

function getRelevantEmoji(name, category, currentEmoji) {
  if (currentEmoji && currentEmoji !== '📦' && currentEmoji.trim() !== '') {
    return currentEmoji.trim();
  }
  const n = String(name || '').toLowerCase().trim();
  const c = String(category?.name || category || '').toLowerCase().trim();

  if (n) {
    for (const item of KEYWORD_MAP) {
      for (const k of item.keys) {
        if (n.includes(k)) return item.emoji;
      }
    }
  }
  if (c) {
    for (const item of CATEGORY_MAP) {
      for (const k of item.keys) {
        if (c.includes(k)) return item.emoji;
      }
    }
  }
  if (c.includes('pack') || c.includes('suppl') || n.includes('box')) return '📦';
  return '🍽️';
}

module.exports = { getRelevantEmoji };
