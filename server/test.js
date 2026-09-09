require('dotenv').config();

const Groq = require('groq-sdk');

async function testGroq() {
  console.log('Testing Groq API...\n');

  // Check that the API key exists without exposing it
  if (!process.env.GROQ_API_KEY) {
    console.error('❌ GROQ_API_KEY is not configured.');
    console.error('Make sure your .env file contains:');
    console.error('GROQ_API_KEY=your_api_key_here');
    process.exit(1);
  }

  console.log('✅ GROQ_API_KEY found');

  const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
  });

  try {
    const response = await groq.chat.completions.create({
      model: 'openai/gpt-oss-120b',

      messages: [
        {
          role: 'system',
          content: 'You are a helpful railway booking assistant. Respond only with valid JSON.'
        },
        {
          role: 'user',
          content: 'Say hello and confirm that the RailBot API is working.'
        }
      ],

      temperature: 0.3,
      max_tokens: 200,

      response_format: {
        type: 'json_object'
      }
    });

    console.log('✅ Groq API request successful!');
    console.log('✅ Model:', response.model);
    console.log('\nAI response:');
    console.log(response.choices[0].message.content);

    // Verify that the response is actually valid JSON
    try {
      const parsed = JSON.parse(response.choices[0].message.content);

      console.log('\n✅ Response is valid JSON!');
      console.log('\nParsed response:');
      console.log(JSON.stringify(parsed, null, 2));
    } catch (error) {
      console.error('\n❌ Response was not valid JSON.');
      console.error(error.message);
    }

  } catch (error) {
    console.error('\n❌ Groq API request failed.');

    console.error('Status:', error.status || 'unknown');
    console.error('Message:', error.message);

    if (error.status === 401) {
      console.error('\nYour GROQ_API_KEY is invalid or unauthorized.');
    } else if (error.status === 404) {
      console.error('\nThe model was not found or is unavailable.');
    } else if (error.status === 429) {
      console.error('\nYou have hit a Groq rate limit.');
    }

    process.exit(1);
  }
}

testGroq();
