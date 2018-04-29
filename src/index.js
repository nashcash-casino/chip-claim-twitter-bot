import Web3 from 'web3'
import Dagger from 'eth-dagger'
import Twitter from 'twitter'
import sample from 'lodash.sample'
import dotenv from 'dotenv'
import winston from 'winston'
import ChipTreasury from './contracts/ChipTreasury'

// load env vars
dotenv.config()

// create logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transport: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
})

if (process.env.NODE_ENV !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: winston.format.simple()
    })
  )
}

// hashtags for tweet body
const hashtagsText = '#nashcash #ethereal'

// emojis for tweet body
const emojis = {
  third: '🥉',
  dizzy: '💫',
  horns: '🤘',
  devil: '😈',
  money: '💸',
  fuego: '🔥',
  sparkle: '✨',
  nervous: '😬',
  anxious: '😰'
}

// random emoji list
const randomEmojiList = [
  emojis.devil,
  emojis.money,
  emojis.fuego,
  emojis.nervous
]

// utility for formatting chip ids
const padId = id => {
  if (id < 10) return '00' + id
  if (id < 100) return '0' + id
  return id
}

// utility for generating a portion of the tweet body regarding claiming
const getChipClaimedText = (chipId, sender, isRopsten) =>
  `${isRopsten ? 'Ropsten ' : ''}Chip #${padId(
    chipId
  )} has been claimed by ${sender}.`

// utility for generating a portion of the tweet body regarding chip supply
const getNumChipsText = (numChipsMinted, numChipsClaimed) => {
  const numChipsUnclaimed = numChipsMinted - numChipsClaimed
  // first 10 chips are gone
  if (numChipsClaimed === 10) { return `The first 10 chips are gone! ${emojis.dizzy}` }
  // 2/3 chips remaining (exactly)
  if (numChipsUnclaimed === Math.ceil(2 / 3 * numChipsMinted)) { return `A third of the way there! ${emojis.third}` }
  // 1/2 chips remaining (exactly)
  if (numChipsUnclaimed === Math.ceil(1 / 2 * numChipsMinted)) { return `Half way there! ${numChipsMinted} left ${emojis.horns}` }
  // < 1/4 chips remaining
  if (numChipsUnclaimed <= Math.floor(1 / 4 * numChipsMinted)) { return `Only ${numChipsUnclaimed} left! ${emojis.anxious}` }
  // last chip has been claimed
  if (numChipsUnclaimed === 0) {
    return `Aaaaand they're gone, every chip has been claimed! ${
      emojis.sparkle
    }`
  }
  // default
  return `There are ${numChipsUnclaimed} left to claim ${sample(
    randomEmojiList
  )}`
}

// instantiate web3 clients
const web3 = new Web3(process.env.WS_PROVIDER)
const web3Ropsten = new Web3(process.env.WS_PROVIDER_ROPSTEN)
const dagger = new Dagger('wss://mainnet.dagger.matic.network')
const daggerRopsten = new Dagger('wss://ropsten.dagger.matic.network')

// instantiate twitter client
const twitterClient = new Twitter({
  consumer_key: process.env.TWITTER_CONSUMER_KEY,
  consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
  access_token_key: process.env.TWITTER_ACCESS_TOKEN_KEY,
  access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET
})

// get contract instances
const { abi } = ChipTreasury
const web3Contract = new web3.eth.Contract(
  ChipTreasury.abi,
  process.env.CONTRACT_ADDRESS
)
const web3ContractRopsten = new web3Ropsten.eth.Contract(
  abi,
  process.env.CONTRACT_ADDRESS_ROPSTEN
)
const daggerContract = dagger.contract(web3Contract)
const daggerContractRopsten = daggerRopsten.contract(web3ContractRopsten)

// listen for incoming blocks
dagger.on('latest:block.number', blockNumber => {
  logger.info(`Mainnet: Current Block # ${blockNumber}`)
})

daggerRopsten.on('latest:block.number', async blockNumber => {
  logger.info(`Ropsten: Current Block # ${blockNumber}`)
})

const chipClaimSuccessFilter = daggerContract.events.ChipClaimSuccess({
  from: 'latest',
  room: 'latest'
})

const chipClaimSuccessFilterRopsten = daggerContractRopsten.events.ChipClaimSuccess(
  {
    from: 'latest',
    room: 'latest'
  }
)

chipClaimSuccessFilter.watch(async event => {
  try {
    const { transactionHash, returnValues: { chipId, sender } } = event
    const etherscanUrl = `https://etherscan.io/tx/${transactionHash}`
    const numChipsMinted = await web3Contract.methods.numChipsMinted().call()
    const numChipsClaimed = await web3Contract.methods.numChipsClaimed().call()

    const chipClaimedText = getChipClaimedText(chipId, sender)
    const numChipsText = getNumChipsText(numChipsMinted, numChipsClaimed)
    const status = [
      chipClaimedText,
      numChipsText,
      hashtagsText,
      etherscanUrl
    ].join(' ')

    const tweet = await twitterClient.post('statuses/update', { status })
    logger.info(`Mainnet: New Tweet: ${tweet.text}`)
  } catch (err) {
    logger.error(err)
  }
})

chipClaimSuccessFilterRopsten.watch(async event => {
  try {
    const { transactionHash, returnValues: { chipId, sender } } = event
    const etherscanUrl = `https://ropsten.etherscan.io/tx/${transactionHash}`
    const numChipsMinted = await web3ContractRopsten.methods
      .numChipsMinted()
      .call()
    const numChipsClaimed = await web3ContractRopsten.methods
      .numChipsClaimed()
      .call()

    const chipClaimedText = getChipClaimedText(chipId, sender, true)
    const numChipsText = getNumChipsText(numChipsMinted, numChipsClaimed)
    const status = [
      chipClaimedText,
      numChipsText,
      hashtagsText,
      etherscanUrl
    ].join(' ')

    const tweet = await twitterClient.post('statuses/update', { status })
    logger.info(`Ropsten: New Tweet: ${tweet.text}`)
  } catch (err) {
    logger.error(err)
  }
})
