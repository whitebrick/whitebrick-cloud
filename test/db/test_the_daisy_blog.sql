INSERT INTO test_the_daisy_blog.authors(id,name) VALUES
  (1, 'Satoshi Nakamoto'),
  (2, 'Linus Torvalds'),
  (3, 'JK Rowling')
ON CONFLICT DO NOTHING;

INSERT INTO test_the_daisy_blog.posts(id, author_id, title, body) VALUES
  (10, 3, 'What Harry Potter ate for Breakfast', 'Sausages, kippers, porridge, fried tomatoes.'),
  (11, 3, 'How fast is the the Nimbus 2000?', 'Sirius then gives him an upgraded broomstick—the esteemed Firebolt.'),
  (12, 1, 'Bitcoin Price Crashing', 'Bitcoins price plunged by nearly 30% after Chinese regulators annoucement.'),
  (13, 1, 'How many Big Macs can you buy with Bitcoin?', 'Lots.'),
  (14, 2, 'Running Linux on a Mac', 'Linux can be installed directly on Mac hardware, in a dual boot configuration with macOS.')
ON CONFLICT DO NOTHING;

INSERT INTO test_the_daisy_blog.tags(id, name) VALUES
  (100,'tech'),
  (101,'food'),
  (102,'trivia'),
  (103,'deep-dive'),
  (104,'finance'),
  (105,'tutorial'),
  (106,'quick-read')
ON CONFLICT DO NOTHING;

INSERT INTO test_the_daisy_blog.post_tags(post_id, tag_id) VALUES
  (10,101),
  (10,102),
  (10,106),
  (11,102),
  (11,106),
  (12,100),
  (12,103),
  (12,104),
  (13,101),
  (13,102),
  (13,106),
  (14,100),
  (14,103),
  (14,105)
ON CONFLICT DO NOTHING;

INSERT INTO test_the_daisy_blog.post_links(post_id, url) VALUES
  (10,'http://harrypotter.com'),
  (11,'http://nimbus2000.com'),
  (12,'http://bitcoin.com'),
  (12,'http://bitcoin-market.com'),
  (14,'http://linux.com'),
  (14,'http://linux-news.com'),
  (14,'http://linux-help.com')
ON CONFLICT DO NOTHING;

