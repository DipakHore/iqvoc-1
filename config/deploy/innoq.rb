# encoding: UTF-8

# Copyright 2011 innoQ Deutschland GmbH
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

@capistrano_history ||= {}

# main details
servername = "iqvoc.innoq.com"
role :web, servername
role :app, servername
role :db,  servername, :primary => true

username = Capistrano::CLI.ui.ask("Please enter a ssh username for #{servername}  [#{@capistrano_history['last_user']}]: ")
username = @capistrano_history['last_user'] if username == ""
@capistrano_history['last_user'] = username

# server details
default_run_options[:pty] = true
ssh_options[:forward_agent] = true
set :deploy_to, "/var/www/iqvoc"
set :deploy_via, :remote_cache
set :user, username
set :use_sudo, false

save_history if defined?(save_history)
