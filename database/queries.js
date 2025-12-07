
const { MongoClient } = require('mongodb');

const URI = 'mongodb://localhost:27017';
const DB_NAME = 'apple_music_db';

async function main() {
  const client = new MongoClient(URI);

  try {
    await client.connect();
    const db = client.db(DB_NAME);

    console.log('✅ Conectado a MongoDB - apple_music_db');
    console.log('--------------------------------------------------');

    await royaltiesLastMonth(db);
    await top10GuatemalaLast7Days(db);
    await premiumZombiesLast30Days(db);
    await reggaetonAgeDistribution(db);
    await badBunnyHeavyUsers(db);

  } catch (err) {
    console.error('❌ Error ejecutando las consultas:', err);
  } finally {
    await client.close();
    console.log('🔌 Conexión cerrada');
  }
}


async function royaltiesLastMonth(db) {
  console.log('\n1) Reporte de Regalías (últimos 30 días)\n');

  const lastMonth = new Date();
  lastMonth.setDate(lastMonth.getDate() - 30);

  const pipeline = [
    {
      $match: {
        date: { $gte: lastMonth }
      }
    },
    {
      $group: {
        _id: '$artist_id',
        total_seconds: { $sum: '$seconds_played' }
      }
    },
    {
      $lookup: {
        from: 'artists',
        localField: '_id',
        foreignField: '_id',
        as: 'artist'
      }
    },
    { $unwind: '$artist' },
    {
      $project: {
        _id: 0,
        artist_id: '$_id',
        artist_name: '$artist.name',
        genre: '$artist.genre',
        total_seconds: 1
      }
    },
    {
      $sort: { total_seconds: -1 }
    }
  ];

  const results = await db.collection('streams').aggregate(pipeline).toArray();
  console.log(JSON.stringify(results, null, 2));
}


async function top10GuatemalaLast7Days(db) {
  console.log('\n2) Top 10 canciones en Guatemala (últimos 7 días)\n');

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const pipeline = [
    {
      $match: {
        date: { $gte: sevenDaysAgo }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: 'user_id',
        foreignField: '_id',
        as: 'user'
      }
    },
    { $unwind: '$user' },
    {
      $match: {
        'user.country': 'GT'
      }
    },
    {
      $lookup: {
        from: 'songs',
        localField: 'song_id',
        foreignField: '_id',
        as: 'song'
      }
    },
    { $unwind: '$song' },
    {
      $group: {
        _id: '$song._id',
        title: { $first: '$song.title' },
        artist_name: { $first: '$song.artist_name' },
        genre: { $first: '$song.genre' },
        play_count: { $sum: 1 }
      }
    },
    {
      $sort: { play_count: -1 }
    },
    {
      $limit: 10
    }
  ];

  const results = await db.collection('streams').aggregate(pipeline).toArray();
  console.log(JSON.stringify(results, null, 2));
}


async function premiumZombiesLast30Days(db) {
  console.log('\n3) Usuarios Zombis (Premium sin streams en últimos 30 días)\n');

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const pipeline = [
    {
      $match: {
        subscription: 'Premium'
      }
    },
    {
      $lookup: {
        from: 'streams',
        let: { userId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$user_id', '$$userId'] },
                  { $gte: ['$date', thirtyDaysAgo] }
                ]
              }
            }
          }
        ],
        as: 'recent_streams'
      }
    },
    {
      $match: {
        recent_streams: { $eq: [] }
      }
    },
    {
      $project: {
        _id: 1,
        username: 1,
        email: 1,
        country: 1,
        subscription: 1,
        created_at: 1
      }
    }
  ];

  const results = await db.collection('users').aggregate(pipeline).toArray();
  console.log(JSON.stringify(results, null, 2));
}


async function reggaetonAgeDistribution(db) {
  console.log('\n4) Distribución de edades de usuarios que escuchan Reggaeton\n');

  const now = new Date();

  const pipeline = [
 
    {
      $lookup: {
        from: 'songs',
        localField: 'song_id',
        foreignField: '_id',
        as: 'song'
      }
    },
    { $unwind: '$song' },
    {
      $match: {
        'song.genre': 'Reggaeton'
      }
    },
   
    {
      $group: {
        _id: '$user_id'
      }
    },
  
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'user'
      }
    },
    { $unwind: '$user' },
  
    {
      $addFields: {
        age: {
          $dateDiff: {
            startDate: '$user.birth_date',
            endDate: now,
            unit: 'year'
          }
        }
      }
    },
    // Asignar rango de edad
    {
      $addFields: {
        ageRange: {
          $switch: {
            branches: [
              {
                case: {
                  $and: [
                    { $gte: ['$age', 15] },
                    { $lte: ['$age', 20] }
                  ]
                },
                then: '15-20'
              },
              {
                case: {
                  $and: [
                    { $gte: ['$age', 21] },
                    { $lte: ['$age', 30] }
                  ]
                },
                then: '21-30'
              },
              {
                case: {
                  $and: [
                    { $gte: ['$age', 31] },
                    { $lte: ['$age', 40] }
                  ]
                },
                then: '31-40'
              },
              {
                case: {
                  $and: [
                    { $gte: ['$age', 41] },
                    { $lte: ['$age', 50] }
                  ]
                },
                then: '41-50'
              }
            ],
            default: 'other'
          }
        }
      }
    },
    // Conteo por rango
    {
      $group: {
        _id: '$ageRange',
        count: { $sum: 1 }
      }
    },
    // Calcular total y porcentaje
    {
      $group: {
        _id: null,
        totalUsers: { $sum: '$count' },
        buckets: {
          $push: {
            range: '$_id',
            count: '$count'
          }
        }
      }
    },
    { $unwind: '$buckets' },
    {
      $project: {
        _id: 0,
        ageRange: '$buckets.range',
        count: '$buckets.count',
        percentage: {
          $round: [
            {
              $multiply: [
                { $divide: ['$buckets.count', '$totalUsers'] },
                100
              ]
            },
            2
          ]
        }
      }
    },
    {
      $sort: { ageRange: 1 }
    }
  ];

  const results = await db.collection('streams').aggregate(pipeline).toArray();
  console.log(JSON.stringify(results, null, 2));
}


async function badBunnyHeavyUsers(db) {
  console.log('\n5) Heavy Users de Bad Bunny (Top 5 por canciones distintas)\n');

  const pipeline = [
    {
      $lookup: {
        from: 'songs',
        localField: 'song_id',
        foreignField: '_id',
        as: 'song'
      }
    },
    { $unwind: '$song' },
    {
      $match: {
        'song.artist_name': 'Bad Bunny'
      }
    },
    
    {
      $group: {
        _id: {
          user_id: '$user_id',
          song_id: '$song._id'
        }
      }
    },
    {
      $group: {
        _id: '$_id.user_id',
        distinctSongs: { $sum: 1 }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'user'
      }
    },
    { $unwind: '$user' },
    {
      $project: {
        _id: 0,
        user_id: '$_id',
        username: '$user.username',
        email: '$user.email',
        country: '$user.country',
        distinctSongs: 1
      }
    },
    {
      $sort: { distinctSongs: -1 }
    },
    {
      $limit: 5
    }
  ];

  const results = await db.collection('streams').aggregate(pipeline).toArray();
  console.log(JSON.stringify(results, null, 2));
}


main();
